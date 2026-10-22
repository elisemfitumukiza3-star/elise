import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./src/config.js";

const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_ANON_KEY.length > 30 &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } }
}) : null;

const $ = (id) => document.getElementById(id);
let session = null, profile = null, posts = [], authMode = "login", activeSubject = null, isPlatformOwner = false;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf","application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain","text/csv","application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg","image/png","image/webp","image/gif",
  "video/mp4","video/webm","video/quicktime"
]);

function esc(value="") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function notify(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3200);
}
function setStatus(message, isError=false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", isError);
}
function requireConfig() {
  if (!supabase) {
    notify("Connect your Supabase project first. See SETUP.md.");
    return false;
  }
  return true;
}
function showAuth(mode="login") {
  authMode = mode; updateAuthMode(); $("authMessage").textContent = ""; $("authDialog").showModal();
}
function updateAuthMode() {
  const signup = authMode === "signup";
  $("authTitle").textContent = signup ? "Join LearnLoop" : "Welcome back";
  $("authIntro").textContent = signup ? "Create an account to share and discover learning resources." : "Sign in to join the educational community.";
  $("nameWrap").classList.toggle("hidden", !signup);
  $("displayName").required = signup;
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("loginTab").classList.toggle("active", !signup);
  $("signupTab").classList.toggle("active", signup);
}
function safeFileName(name) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "upload";
}
function timeAgo(date) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime())/1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
}
function mediaHtml(post) {
  if (!post.file_path) return "";
  // Use a signed URL so uploaded files in the private bucket are not publicly enumerable.
  if (!post.signedUrl) return `<div class="attachment"><div class="fileicon">FILE</div><div><strong>${esc(post.file_name || "Learning resource")}</strong><small>Attachment</small></div></div>`;
  const mime = post.file_mime || "";
  if (mime.startsWith("image/")) return `<a href="${esc(post.signedUrl)}" target="_blank" rel="noopener"><img class="post-media" src="${esc(post.signedUrl)}" alt="${esc(post.file_name || "Educational image")}"></a>`;
  if (mime.startsWith("video/")) return `<video class="post-media" controls preload="metadata" src="${esc(post.signedUrl)}"></video>`;
  return `<a class="attachment" href="${esc(post.signedUrl)}" target="_blank" rel="noopener"><span class="fileicon">FILE</span><span><strong>${esc(post.file_name || "Learning resource")}</strong><small>Open or download resource</small></span></a>`;
}
function postHtml(post) {
  const liked = (post.my_reaction || []).length > 0;
  const reposted = !!post.reposted_by_me;
  const displayName = post.profiles?.display_name || "LearnLoop member";
  const initials = displayName.split(/\s+/).slice(0,2).map(w => w[0] || "").join("").toUpperCase() || "LL";
  const isOwner = session?.user?.id === post.user_id;
  return `<article class="post" data-post-id="${esc(post.id)}">
    ${post.repost_of ? `<div class="repost-label">⟳ Reposted educational resource</div>` : ""}
    <div class="post-header"><div class="avatar">${esc(initials)}</div><div class="author-block"><strong>${esc(displayName)}</strong><small>${esc(post.profiles?.bio || post.subject || "Community member")} · ${timeAgo(post.created_at)}</small></div><span class="tag">${esc(post.post_type || "Discussion")}</span></div>
    <div class="post-text">${esc(post.body).replace(/\n/g,"<br>")}</div>
    ${post.subject ? `<span class="subject-tag">${esc(post.subject)}</span>` : ""}
    ${mediaHtml(post)}
    <div class="post-stats">${post.like_count || 0} likes · ${post.comment_count || 0} comments · ${post.repost_count || 0} reposts</div>
    <div class="post-actions">
      <button class="action ${liked ? "liked" : ""}" data-action="like" data-id="${esc(post.id)}">${liked ? "♥ Liked" : "♡ Like"}</button>
      <button class="action" data-action="comment" data-id="${esc(post.id)}">▢ Comment</button>
      <button class="action" data-action="share" data-id="${esc(post.id)}">↗ Share</button>
      <button class="action" data-action="repost" data-id="${esc(post.id)}">${reposted ? "✓ Reposted" : "⟳ Repost"}</button>
      <button class="action report-action" data-action="report" data-id="${esc(post.id)}">⚑ Report</button>
      ${isOwner ? `<button class="action report-action" data-action="delete" data-id="${esc(post.id)}">Delete</button>` : ""}
    </div>
    <section class="comments" id="comments-${esc(post.id)}"><div class="comment-list" id="comment-list-${esc(post.id)}"></div>
      <form class="comment-form" data-post-id="${esc(post.id)}"><input name="body" maxlength="2000" required placeholder="Write a helpful comment..." aria-label="Comment"><button class="primary">Send</button></form>
    </section>
  </article>`;
}
async function hydratePostFiles(items) {
  if (!supabase) return items;
  return Promise.all(items.map(async post => {
    if (!post.file_path) return post;
    const { data } = await supabase.storage.from("learning-files").createSignedUrl(post.file_path, 60 * 30);
    return { ...post, signedUrl: data?.signedUrl || null };
  }));
}
async function loadPosts() {
  if (!supabase) {
    setStatus("Setup needed: connect Supabase and run the SQL in supabase/schema.sql. The website is ready to configure.");
    $("feed").innerHTML = `<div class="panel empty"><h3>Your educational community starts here</h3><p>Once connected, members can register, upload resources, react, comment, repost, and report content.</p><button class="primary" id="setupAuth">Sign in / Create account</button></div>`;
    $("setupAuth").onclick = () => showAuth();
    return;
  }
  setStatus("Loading learning feed…");
  let query = supabase.from("posts").select("*, profiles:user_id(display_name,bio)").eq("status","published").order("created_at",{ascending:false}).limit(100);
  if (activeSubject) query = query.eq("subject", activeSubject);
  const { data, error } = await query;
  if (error) { setStatus(`Could not load posts: ${error.message}`, true); return; }
  posts = data || [];
  if (session) {
    const ids = posts.map(p => p.id);
    if (ids.length) {
      const [{data: likes}, {data: reposts}, {data: counts}] = await Promise.all([
        supabase.from("reactions").select("post_id").eq("user_id", session.user.id).in("post_id", ids),
        supabase.from("posts").select("repost_of").eq("user_id", session.user.id).in("repost_of", ids),
        supabase.from("comments").select("post_id").in("post_id", ids)
      ]);
      const likeIds = new Set((likes || []).map(x => x.post_id));
      const repostIds = new Set((reposts || []).map(x => x.repost_of));
      const countMap = {};
      (counts || []).forEach(c => countMap[c.post_id] = (countMap[c.post_id] || 0) + 1);
      posts = posts.map(p => ({...p, my_reaction: likeIds.has(p.id) ? [true] : [], reposted_by_me: repostIds.has(p.id), comment_count: countMap[p.id] || 0}));
    }
  }
  posts = await hydratePostFiles(posts);
  renderPosts();
  setStatus(posts.length ? `${posts.length} recent learning post${posts.length===1?"":"s"}` : "No posts yet. Be the first to share a learning resource.");
  const channel = supabase.channel("public-post-feed").on("postgres_changes", {event:"*", schema:"public", table:"posts"}, () => loadPosts()).subscribe();
  window.__feedChannel?.unsubscribe?.();
  window.__feedChannel = channel;
}
function renderPosts() {
  const term = $("searchInput").value.trim().toLowerCase();
  let list = [...posts].filter(p => !term || `${p.body} ${p.subject} ${p.post_type} ${p.profiles?.display_name} ${p.file_name||""}`.toLowerCase().includes(term));
  if ($("sortSelect").value === "popular") list.sort((a,b)=>(b.like_count||0)+(b.repost_count||0)-(a.like_count||0)-(a.repost_count||0));
  $("feed").innerHTML = list.length ? list.map(postHtml).join("") : `<div class="panel empty">No matching posts found.</div>`;
}
async function refreshSession() {
  if (!supabase) { updateAccountUI(); return; }
  const { data } = await supabase.auth.getSession();
  session = data.session;
  await loadProfile();
  await loadOwnerAccess();
  updateAccountUI();
  await loadPosts();
}
async function loadProfile() {
  profile = null;
  if (!session) return;
  const {data} = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  profile = data;
}
function updateAccountUI() {
  $("hostDashboardButton").classList.toggle("hidden", !isPlatformOwner);
  const name = profile?.display_name || session?.user?.email || "";
  $("accountButton").textContent = session ? (name.split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase() || "ME") : "?";
  $("profileSummary").textContent = session ? `${name}${profile?.bio ? " — "+profile.bio : ""}` : "Sign in to see your profile.";
  $("profileButton").textContent = session ? "Edit profile" : "Sign in / Create account";
}

async function loadOwnerAccess() {
  isPlatformOwner = false;
  if (!supabase || !session) { $("hostDashboardButton").classList.add("hidden"); return; }
  const { data, error } = await supabase.rpc("is_platform_owner");
  isPlatformOwner = !error && data === true;
  $("hostDashboardButton").classList.toggle("hidden", !isPlatformOwner);
}
async function openHostDashboard() {
  if (!session) return showAuth();
  await loadOwnerAccess();
  if (!isPlatformOwner) return notify("Host settings are restricted to the platform owner.");
  const { data, error } = await supabase.from("platform_revenue_settings").select("enabled_methods,ad_placement").eq("id", true).maybeSingle();
  if (error || !data) return notify("Could not load private host settings. Run the latest supabase/schema.sql first.");
  const methods = Array.isArray(data.enabled_methods) ? data.enabled_methods : ["ads","sponsorships"];
  $("revAds").checked = methods.includes("ads");
  $("revSponsors").checked = methods.includes("sponsorships");
  $("revReferrals").checked = methods.includes("referrals");
  $("revSupport").checked = methods.includes("support");
  $("adPlacement").value = data.ad_placement || "limited";
  $("revenueSettingsMessage").textContent = "";
  $("hostDashboardDialog").showModal();
}
async function saveRevenueSettings(event) {
  event.preventDefault();
  if (!session || !isPlatformOwner) return notify("Not authorized to change host settings.");
  const enabled_methods = [];
  if ($("revAds").checked) enabled_methods.push("ads");
  if ($("revSponsors").checked) enabled_methods.push("sponsorships");
  if ($("revReferrals").checked) enabled_methods.push("referrals");
  if ($("revSupport").checked) enabled_methods.push("support");
  if (!enabled_methods.length) { $("revenueSettingsMessage").textContent = "Select at least one host revenue method."; return; }
  const { error } = await supabase.from("platform_revenue_settings").upsert({id:true,enabled_methods,ad_placement:$("adPlacement").value,updated_at:new Date().toISOString()});
  if (error) { $("revenueSettingsMessage").textContent = "Could not save settings: " + error.message; return; }
  $("hostDashboardDialog").close(); notify("Private host revenue preferences saved.");
}

async function publishPost(event) {
  event.preventDefault();
  if (!requireConfig()) return;
  if (!session) { showAuth("login"); notify("Please sign in before publishing."); return; }
  const body = $("postText").value.trim(), file = $("postFile").files[0];
  if (!body) { notify("Please write something educational before publishing."); return; }
  if (file && file.size > MAX_FILE_BYTES) { notify("That file is over the 50 MB limit."); return; }
  if (file && !ALLOWED_MIME.has(file.type)) { notify("This file type is not supported. Use PDF, Office documents, images, or common video formats."); return; }
  const button = $("postForm").querySelector('[type="submit"]');
  button.disabled = true; button.textContent = "Publishing…";
  try {
    let filePath = null;
    if (file) {
      filePath = `${session.user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const {error: uploadError} = await supabase.storage.from("learning-files").upload(filePath, file, {contentType:file.type || "application/octet-stream", upsert:false});
      if (uploadError) throw uploadError;
    }
    const {error} = await supabase.from("posts").insert({
      user_id:session.user.id, body, post_type:$("postType").value, subject:$("postSubject").value,
      file_path:filePath, file_name:file?.name || null, file_mime:file?.type || null, status:"published"
    });
    if (error) {
      if (filePath) await supabase.storage.from("learning-files").remove([filePath]);
      throw error;
    }
    $("postForm").reset(); $("composer").classList.add("hidden"); notify("Your educational post was published.");
    await loadPosts();
  } catch (error) { notify(error.message || "Could not publish post."); }
  finally { button.disabled = false; button.textContent = "Publish post"; }
}
async function toggleLike(id) {
  if (!session) return showAuth();
  const post = posts.find(p=>p.id===id); if (!post) return;
  const liked = (post.my_reaction||[]).length > 0;
  const result = liked
    ? await supabase.from("reactions").delete().eq("post_id",id).eq("user_id",session.user.id)
    : await supabase.from("reactions").insert({post_id:id,user_id:session.user.id,kind:"like"});
  if (result.error) return notify(result.error.message);
  await loadPosts();
}
async function openComments(id) {
  const section = $(`comments-${id}`);
  section.classList.toggle("show");
  if (!section.classList.contains("show")) return;
  const {data,error} = await supabase.from("comments").select("id,body,created_at,user_id,profiles:user_id(display_name)").eq("post_id",id).eq("status","published").order("created_at",{ascending:true}).limit(100);
  if (error) return notify(error.message);
  $(`comment-list-${id}`).innerHTML = (data||[]).map(c=>`<p><strong>${esc(c.profiles?.display_name||"Member")}:</strong> ${esc(c.body)}</p>`).join("") || `<p class="muted">No comments yet. Start a helpful discussion.</p>`;
}
async function sharePost(id) {
  const url = `${location.origin}${location.pathname}#post-${encodeURIComponent(id)}`;
  try {
    if (navigator.share) await navigator.share({title:"LearnLoop educational resource",url});
    else { await navigator.clipboard.writeText(url); notify("Post link copied."); }
  } catch (e) { if (e.name !== "AbortError") notify("Unable to share from this browser."); }
}
async function repost(id) {
  if (!session) return showAuth();
  const post = posts.find(p=>p.id===id); if (!post) return;
  const {error} = await supabase.from("posts").insert({
    user_id:session.user.id, body:post.body, post_type:post.post_type, subject:post.subject,
    repost_of:post.repost_of || post.id, status:"published"
  });
  if (error) return notify(error.message);
  notify("Reposted with a link to the original post."); await loadPosts();
}
async function reportPost(id) {
  if (!session) return showAuth();
  const reason = prompt("Why are you reporting this post? Choose or type a reason (e.g. spam, harassment, misinformation, copyright).");
  if (!reason?.trim()) return;
  const details = prompt("Optional details for the moderators (or leave blank).") || "";
  const {error} = await supabase.from("reports").insert({reporter_id:session.user.id,post_id:id,reason:reason.trim().slice(0,100),details:details.trim().slice(0,1000)});
  notify(error ? error.message : "Report sent to moderators. Thank you for helping keep the community safe.");
}
async function deletePost(id) {
  if (!session || !confirm("Delete your post? This cannot be undone.")) return;
  const {error} = await supabase.from("posts").delete().eq("id",id).eq("user_id",session.user.id);
  if (error) return notify(error.message);
  notify("Post deleted."); await loadPosts();
}
async function authSubmit(event) {
  event.preventDefault();
  if (!requireConfig()) return;
  const email=$("email").value.trim(), password=$("password").value;
  $("authSubmit").disabled=true; $("authMessage").textContent="";
  try {
    if (authMode==="signup") {
      const display_name=$("displayName").value.trim();
      const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name}}});
      if (error) throw error;
      if (data.session) {
        await supabase.from("profiles").upsert({id:data.user.id,display_name});
        notify("Account created. Welcome to LearnLoop!"); $("authDialog").close(); await refreshSession();
      } else {
        $("authMessage").textContent="Account created. Check your email to confirm your address, then sign in.";
      }
    } else {
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if (error) throw error;
      $("authDialog").close(); notify("Signed in successfully."); await refreshSession();
    }
  } catch(error) { $("authMessage").textContent=error.message || "Authentication failed."; }
  finally { $("authSubmit").disabled=false; }
}
async function saveProfile(event) {
  event.preventDefault(); if (!session) return showAuth();
  const display_name=$("profileName").value.trim(), bio=$("profileBio").value.trim();
  const {error}=await supabase.from("profiles").upsert({id:session.user.id,display_name,bio,updated_at:new Date().toISOString()});
  if (error) return notify(error.message);
  await loadProfile(); updateAccountUI(); $("profileDialog").close(); notify("Profile updated."); await loadPosts();
}

$("loginTab").onclick=()=>{authMode="login";updateAuthMode();};
$("signupTab").onclick=()=>{authMode="signup";updateAuthMode();};
$("authForm").addEventListener("submit",authSubmit);
$("postForm").addEventListener("submit",publishPost);
$("profileForm").addEventListener("submit",saveProfile);
$("revenueSettingsForm").addEventListener("submit",saveRevenueSettings);
$("hostDashboardButton").addEventListener("click",openHostDashboard);
$("newPostTop").onclick=$("heroCreate").onclick=()=>{if(!session)return showAuth();$("composer").classList.remove("hidden");$("composer").scrollIntoView({behavior:"smooth",block:"center"});$("postText").focus();};
$("cancelPost").onclick=()=>$("composer").classList.add("hidden");
$("profileButton").onclick=$("accountButton").onclick=()=>{if(!session)return showAuth();$("profileName").value=profile?.display_name||"";$("profileBio").value=profile?.bio||"";$("profileDialog").showModal();};
$("signOut").onclick=async()=>{await supabase.auth.signOut();session=null;profile=null;$("profileDialog").close();updateAccountUI();await loadPosts();notify("Signed out.");};
$("searchInput").addEventListener("input",renderPosts);
$("sortSelect").addEventListener("change",renderPosts);
document.querySelectorAll("[data-subject]").forEach(b=>b.onclick=()=>{activeSubject=activeSubject===b.dataset.subject?null:b.dataset.subject;document.querySelectorAll("[data-subject]").forEach(x=>x.classList.toggle("selected",x.dataset.subject===activeSubject));$("feedTitle").textContent=activeSubject?`${activeSubject} resources`:"Your learning feed";loadPosts();});

document.querySelectorAll("[data-view]").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll("[data-view]").forEach(x =>
      x.classList.toggle("active", x === b)
    );

    const view = b.dataset.view;
    activeSubject = null;

    $("feedTitle").textContent = ({
      feed: "Your learning feed",
      following: "Following",
      saved: "Saved resources",
      library: "Learning Library",
      discussions: "Discussions",
      community: "Community",
      notifications: "Notifications",
      dashboard: "Learning Dashboard"
    })[view] || "Your learning feed";

    if (view === "saved" || view === "following") {
      notify(view === "saved"
        ? "Saved resources are not implemented yet."
        : "Following feed is not implemented yet.");
      return;
    }

    if (view !== "feed") {
      notify("This section is not implemented yet. Your learning feed is still available.");
      return;
    }

    loadPosts();
  };
});

$("feed").addEventListener("click",async event=>{
  const button=event.target.closest("[data-action]"); if(!button)return;
  const id=button.dataset.id, action=button.dataset.action;
  if(action==="like")return toggleLike(id);
  if(action==="comment")return openComments(id);
  if(action==="share")return sharePost(id);
  if(action==="repost")return repost(id);
  if(action==="report")return reportPost(id);
  if(action==="delete")return deletePost(id);
});
$("feed").addEventListener("submit",async event=>{
  const form=event.target.closest(".comment-form"); if(!form)return;
  event.preventDefault(); if(!session)return showAuth();
  const id=form.dataset.postId, body=new FormData(form).get("body").toString().trim(); if(!body)return;
  const {error}=await supabase.from("comments").insert({post_id:id,user_id:session.user.id,body,status:"published"});
  if(error)return notify(error.message);
  form.reset(); await openComments(id); await loadPosts(); $(`comments-${id}`)?.classList.add("show");
});
supabase?.auth.onAuthStateChange((_event,newSession)=>{session=newSession;setTimeout(()=>refreshSession(),0);});
updateAuthMode();
refreshSession();
