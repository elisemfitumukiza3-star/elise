import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./src/config.js";

/* =========================================================
   LEARNLOOP — MAIN APPLICATION
   Keeps the existing Supabase project and database.
   ========================================================= */

const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_ANON_KEY.length > 30 &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: { eventsPerSecond: 5 }
      }
    })
  : null;

window.learnLoopSupabase = supabase;

const $ = id => document.getElementById(id);

let session = null;
let profile = null;
let posts = [];
let authMode = "login";
let activeSubject = null;
let activeView = "feed";
let isPlatformOwner = false;
let feedChannel = null;
let loadingPosts = false;

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

const VIEW_TITLES = {
  feed: "Your learning feed",
  following: "Following",
  saved: "Saved resources",
  library: "Learning Library",
  discussions: "Discussions",
  community: "Community",
  notifications: "Notifications",
  dashboard: "Learning Dashboard"
};

/* =========================================================
   HELPERS
   ========================================================= */

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function notify(message) {
  const toast = $("toast");
  if (!toast) {
    console.info(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(
    () => toast.classList.remove("visible"),
    3200
  );
}

function setStatus(message, isError = false) {
  const status = $("status");
  if (!status) return;

  status.textContent = message;
  status.classList.toggle("error", isError);
}

function requireConfig() {
  if (!supabase) {
    notify("Please configure the existing Supabase connection.");
    return false;
  }
  return true;
}

function requireSession() {
  if (!requireConfig()) return false;

  if (!session) {
    showAuth("login");
    return false;
  }

  return true;
}

function safeFileName(name) {
  return String(name || "upload")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100) || "upload";
}

function timeAgo(date) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000)
  );

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  return `${Math.floor(seconds / 86400)}d ago`;
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog?.open) dialog.close();
}

function showDialog(id) {
  const dialog = $(id);
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.classList.remove("hidden");
  }
}

function setButtonBusy(button, busy, busyText = "Please wait…") {
  if (!button) return;

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;

    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

/* =========================================================
   AUTHENTICATION
   ========================================================= */

function showAuth(mode = "login") {
  if (!requireConfig()) return;

  authMode = mode;
  updateAuthMode();

  if ($("authMessage")) $("authMessage").textContent = "";

  showDialog("authDialog");
}

function updateAuthMode() {
  const signup = authMode === "signup";

  if ($("authTitle")) {
    $("authTitle").textContent = signup
      ? "Join LearnLoop"
      : "Welcome back";
  }

  if ($("authIntro")) {
    $("authIntro").textContent = signup
      ? "Create an account to share and discover learning resources."
      : "Sign in to join the educational community.";
  }

  $("nameWrap")?.classList.toggle("hidden", !signup);

  if ($("displayName")) $("displayName").required = signup;

  if ($("password")) {
    $("password").autocomplete = signup
      ? "new-password"
      : "current-password";
  }

  if ($("authSubmit")) {
    $("authSubmit").textContent = signup
      ? "Create account"
      : "Sign in";
  }

  $("loginTab")?.classList.toggle("active", !signup);
  $("signupTab")?.classList.toggle("active", signup);
}

async function authSubmit(event) {
  event.preventDefault();

  if (!requireConfig()) return;

  const email = $("email")?.value.trim();
  const password = $("password")?.value;
  const displayName = $("displayName")?.value.trim();
  const submitButton = $("authSubmit");
  const message = $("authMessage");

  if (!email || !password) {
    if (message) message.textContent = "Enter your email and password.";
    return;
  }

  if (authMode === "signup" && !displayName) {
    if (message) message.textContent = "Enter your display name.";
    return;
  }

  setButtonBusy(submitButton, true, "Please wait…");
  if (message) message.textContent = "";

  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName }
        }
      });

      if (error) throw error;

      if (data.session) {
        session = data.session;
        closeDialog("authDialog");
        await refreshSession();
        notify("Welcome to LearnLoop!");
      } else {
        if (message) {
          message.textContent =
            "Account created. Check your email for the verification link, then sign in.";
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      session = data.session;
      closeDialog("authDialog");
      await refreshSession();
      notify("You are signed in.");
    }
  } catch (error) {
    if (message) message.textContent = error.message;
    else notify(error.message);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

/* =========================================================
   ACCOUNT AND PROFILE
   ========================================================= */

async function refreshSession() {
  if (!supabase) {
    updateAccountUI();
    await loadPosts();
    return;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    session = data.session;

    await loadProfile();
    await loadOwnerAccess();
    updateAccountUI();
    await loadPosts();
  } catch (error) {
    console.error("Session refresh failed:", error);
    notify("Could not refresh your session. Please reload the page.");
  }
}

async function loadProfile() {
  profile = null;
  if (!session || !supabase) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile load failed:", error.message);
    return;
  }

  profile = data;
}

function updateAccountUI() {
  $("hostDashboardButton")?.classList.toggle(
    "hidden",
    !isPlatformOwner
  );

  const name =
    profile?.display_name ||
    session?.user?.email ||
    "";

  if ($("accountButton")) {
    $("accountButton").textContent = session
      ? (
          name.split(/\s+/)
            .slice(0, 2)
            .map(part => part[0] || "")
            .join("")
            .toUpperCase() || "ME"
        )
      : "?";
  }

  if ($("profileSummary")) {
    $("profileSummary").textContent = session
      ? `${name}${profile?.bio ? " — " + profile.bio : ""}`
      : "Sign in to see your profile.";
  }

  if ($("profileButton")) {
    $("profileButton").textContent = session
      ? "Edit profile"
      : "Sign in / Create account";
  }

  $("signOut")?.classList.toggle("hidden", !session);
}

function openProfile() {
  if (!requireSession()) return;

  const fields = {
    profileName: profile?.display_name || "",
    profileBio: profile?.bio || "",
    profileFullName: profile?.full_name || "",
    profilePhone: profile?.phone_number || "",
    profileInstitution: profile?.institution || "",
    profileStudyLevel: profile?.study_level || "",
    profileInterests: profile?.interests || "",
    profileEmail: session?.user?.email || ""
  };

  for (const [id, value] of Object.entries(fields)) {
    if ($(id)) $(id).value = value;
  }

  showDialog("profileDialog");
}

async function saveProfile(event) {
  event.preventDefault();

  if (!requireSession()) return;

  const payload = {
    id: session.user.id,
    display_name: $("profileName")?.value.trim() || "",
    bio: $("profileBio")?.value.trim() || "",
    full_name: $("profileFullName")?.value.trim() || "",
    phone_number: $("profilePhone")?.value.trim() || "",
    phone_is_public: false,
    institution: $("profileInstitution")?.value.trim() || "",
    study_level: $("profileStudyLevel")?.value.trim() || "",
    interests: $("profileInterests")?.value.trim() || "",
    updated_at: new Date().toISOString()
  };

  const button = $("profileForm")?.querySelector('[type="submit"]');
  setButtonBusy(button, true, "Saving…");

  try {
    const { error } = await supabase
      .from("profiles")
      .upsert(payload);

    if (error) throw error;

    await loadProfile();
    updateAccountUI();
    closeDialog("profileDialog");
    notify("Profile updated successfully.");
  } catch (error) {
    notify("Could not save profile: " + error.message);
  } finally {
    setButtonBusy(button, false);
  }
}

async function signOut() {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();

  if (error) {
    notify("Could not sign out: " + error.message);
    return;
  }

  session = null;
  profile = null;
  isPlatformOwner = false;

  closeDialog("profileDialog");
  updateAccountUI();
  await loadPosts();

  notify("Signed out.");
}

/* =========================================================
   HOST ACCESS AND HOST SETTINGS
   ========================================================= */

async function loadOwnerAccess() {
  isPlatformOwner = false;

  if (!supabase || !session) {
    $("hostDashboardButton")?.classList.add("hidden");
    return;
  }

  const { data, error } = await supabase.rpc("is_platform_owner");

  isPlatformOwner = !error && data === true;

  $("hostDashboardButton")?.classList.toggle(
    "hidden",
    !isPlatformOwner
  );
}

async function openHostDashboard() {
  if (!requireSession()) return;

  await loadOwnerAccess();

  if (!isPlatformOwner) {
    notify("Host settings are restricted to the platform owner.");
    return;
  }

  const { data, error } = await supabase
    .from("platform_revenue_settings")
    .select("enabled_methods,ad_placement")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) {
    notify("Could not load private host settings.");
    return;
  }

  const methods = Array.isArray(data.enabled_methods)
    ? data.enabled_methods
    : ["ads", "sponsorships"];

  if ($("revAds")) $("revAds").checked = methods.includes("ads");
  if ($("revSponsors")) {
    $("revSponsors").checked = methods.includes("sponsorships");
  }
  if ($("revReferrals")) {
    $("revReferrals").checked = methods.includes("referrals");
  }
  if ($("revSupport")) {
    $("revSupport").checked = methods.includes("support");
  }

  if ($("adPlacement")) {
    $("adPlacement").value = data.ad_placement || "limited";
  }

  if ($("revenueSettingsMessage")) {
    $("revenueSettingsMessage").textContent = "";
  }

  showDialog("hostDashboardDialog");
}

async function saveRevenueSettings(event) {
  event.preventDefault();

  if (!session || !isPlatformOwner) {
    notify("Not authorized to change host settings.");
    return;
  }

  const enabled_methods = [];

  if ($("revAds")?.checked) enabled_methods.push("ads");
  if ($("revSponsors")?.checked) {
    enabled_methods.push("sponsorships");
  }
  if ($("revReferrals")?.checked) enabled_methods.push("referrals");
  if ($("revSupport")?.checked) enabled_methods.push("support");

  const message = $("revenueSettingsMessage");

  if (!enabled_methods.length) {
    if (message) {
      message.textContent = "Select at least one revenue method.";
    }
    return;
  }

  try {
    const { error } = await supabase
      .from("platform_revenue_settings")
      .upsert({
        id: true,
        enabled_methods,
        ad_placement: $("adPlacement")?.value || "limited",
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    closeDialog("hostDashboardDialog");
    notify("Host preferences saved.");
  } catch (error) {
    if (message) {
      message.textContent = "Could not save settings: " + error.message;
    }
  }
}

/* =========================================================
   POSTS AND ATTACHMENTS
   ========================================================= */

async function hydratePostFiles(items) {
  if (!supabase) return items;

  return Promise.all(items.map(async post => {
    if (!post.file_path) return post;

    const { data, error } = await supabase.storage
      .from("learning-files")
      .createSignedUrl(post.file_path, 1800);

    if (error) {
      console.warn("Could not create attachment URL:", error.message);
    }

    return {
      ...post,
      signedUrl: data?.signedUrl || null
    };
  }));
}

function mediaHtml(post) {
  if (!post.file_path) return "";

  const filename = esc(post.file_name || "Learning resource");

  if (!post.signedUrl) {
    return `
      <div class="attachment">
        <span class="fileicon">FILE</span>
        <div>
          <strong>${filename}</strong>
          <small>Attachment unavailable</small>
        </div>
      </div>
    `;
  }

  const url = esc(post.signedUrl);
  const mime = post.file_mime || "";

  if (mime.startsWith("image/")) {
    return `
      <a href="${url}" target="_blank" rel="noopener noreferrer">
        <img class="post-media" src="${url}" alt="${filename}" loading="lazy">
      </a>
    `;
  }

  if (mime.startsWith("video/")) {
    return `
      <video class="post-media" controls preload="metadata" src="${url}">
        Your browser does not support this video.
      </video>
    `;
  }

  return `
    <a class="attachment" href="${url}" target="_blank" rel="noopener noreferrer">
      <span class="fileicon">FILE</span>
      <span>
        <strong>${filename}</strong>
        <small>Open or download resource</small>
      </span>
    </a>
  `;
}

function postHtml(post) {
  const liked = (post.my_reaction || []).length > 0;
  const reposted = !!post.reposted_by_me;
  const displayName =
    post.profiles?.display_name || "LearnLoop member";

  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0] || "")
    .join("")
    .toUpperCase() || "LL";

  const isOwner = session?.user?.id === post.user_id;

  return `
    <article class="post" data-post-id="${esc(post.id)}">
      ${post.repost_of
        ? '<div class="repost-label">⟳ Reposted educational resource</div>'
        : ""
      }

      <div class="post-header">
        <div class="avatar">${esc(initials)}</div>

        <div class="author-block">
          <strong>${esc(displayName)}</strong>
          <small>
            ${esc(post.profiles?.bio || post.subject || "Community member")}
            · ${esc(timeAgo(post.created_at))}
          </small>
        </div>

        <span class="tag">${esc(post.post_type || "Discussion")}</span>
      </div>

      <div class="post-text">${esc(post.body || "").replace(/\n/g, "<br>")}</div>

      ${post.subject
        ? `<span class="subject-tag">${esc(post.subject)}</span>`
        : ""
      }

      ${mediaHtml(post)}

      <div class="post-stats">
        ${post.like_count || 0} likes ·
        ${post.comment_count || 0} comments ·
        ${post.repost_count || 0} reposts
      </div>

      <div class="post-actions">
        <button type="button" class="action ${liked ? "liked" : ""}"
          data-action="like" data-id="${esc(post.id)}">
          ${liked ? "♥ Liked" : "♡ Like"}
        </button>

        <button type="button" class="action"
          data-action="comment" data-id="${esc(post.id)}">
          ▢ Comment
        </button>

        <button type="button" class="action"
          data-action="share" data-id="${esc(post.id)}">
          ↗ Share
        </button>

        <button type="button" class="action"
          data-action="repost" data-id="${esc(post.id)}">
          ${reposted ? "✓ Reposted" : "⟳ Repost"}
        </button>

        <button type="button" class="action report-action"
          data-action="report" data-id="${esc(post.id)}">
          ⚑ Report
        </button>

        ${isOwner
          ? `<button type="button" class="action report-action"
               data-action="delete" data-id="${esc(post.id)}">
               Delete
             </button>`
          : ""
        }
      </div>

      <section class="comments" id="comments-${esc(post.id)}">
        <div class="comment-list" id="comment-list-${esc(post.id)}"></div>

        <form class="comment-form" data-post-id="${esc(post.id)}">
          <input name="body" maxlength="2000" required
            placeholder="Write a helpful comment..."
            aria-label="Comment">

          <button type="submit" class="primary">Send</button>
        </form>
      </section>
    </article>
  `;
}

async function loadPosts() {
  if (loadingPosts) return;
  loadingPosts = true;

  try {
    if (!supabase) {
      setStatus("Connect your Supabase project to load the feed.");

      if ($("feed")) {
        $("feed").innerHTML = `
          <div class="panel empty">
            <h3>Your educational community starts here</h3>
            <p>Connect Supabase to load your learning feed.</p>
            <button type="button" class="primary" id="setupAuth">
              Sign in / Create account
            </button>
          </div>
        `;

        $("setupAuth").onclick = () => showAuth("login");
      }

      return;
    }

    if (activeView !== "feed") return;

    setStatus("Loading learning feed…");

    let query = supabase
      .from("posts")
      .select("*, profiles:user_id(display_name,bio)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);

    if (activeSubject) {
      query = query.eq("subject", activeSubject);
    }

    const { data, error } = await query;

    if (error) {
      setStatus("Could not load posts: " + error.message, true);
      return;
    }

    let loadedPosts = data || [];

    if (session && loadedPosts.length) {
      const ids = loadedPosts.map(post => post.id);

      const [likesResult, repostsResult, commentsResult] =
        await Promise.all([
          supabase
            .from("reactions")
            .select("post_id")
            .eq("user_id", session.user.id)
            .in("post_id", ids),

          supabase
            .from("posts")
            .select("repost_of")
            .eq("user_id", session.user.id)
            .in("repost_of", ids),

          supabase
            .from("comments")
            .select("post_id")
            .in("post_id", ids)
        ]);

      const likeIds = new Set(
        (likesResult.data || []).map(item => item.post_id)
      );

      const repostIds = new Set(
        (repostsResult.data || []).map(item => item.repost_of)
      );

      const commentCounts = {};

      (commentsResult.data || []).forEach(comment => {
        commentCounts[comment.post_id] =
          (commentCounts[comment.post_id] || 0) + 1;
      });

      loadedPosts = loadedPosts.map(post => ({
        ...post,
        my_reaction: likeIds.has(post.id) ? [true] : [],
        reposted_by_me: repostIds.has(post.id),
        comment_count: commentCounts[post.id] || 0
      }));
    } else {
      loadedPosts = loadedPosts.map(post => ({
        ...post,
        my_reaction: [],
        reposted_by_me: false
      }));
    }

    posts = await hydratePostFiles(loadedPosts);

    renderPosts();

    setStatus(
      posts.length
        ? `${posts.length} recent learning post${posts.length === 1 ? "" : "s"}`
        : "No posts yet. Be the first to share a learning resource."
    );

    if (!feedChannel) {
      feedChannel = supabase
        .channel("public-post-feed")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "posts"
          },
          () => {
            if (activeView === "feed") loadPosts();
          }
        )
        .subscribe();
    }
  } catch (error) {
    console.error("Feed error:", error);
    setStatus("Could not load the learning feed.", true);
  } finally {
    loadingPosts = false;
  }
}

function renderPosts() {
  const feed = $("feed");
  if (!feed) return;

  const term = $("searchInput")?.value.trim().toLowerCase() || "";
  const sort = $("sortSelect")?.value || "latest";

  let list = [...posts].filter(post => {
    const searchable = [
      post.body,
      post.subject,
      post.post_type,
      post.profiles?.display_name,
      post.file_name
    ].join(" ").toLowerCase();

    return !term || searchable.includes(term);
  });

  if (sort === "popular") {
    list.sort((a, b) =>
      ((b.like_count || 0) + (b.repost_count || 0)) -
      ((a.like_count || 0) + (a.repost_count || 0))
    );
  }

  feed.innerHTML = list.length
    ? list.map(postHtml).join("")
    : '<div class="panel empty">No matching posts found.</div>';
}

/* =========================================================
   PUBLISH A POST
   ========================================================= */

async function publishPost(event) {
  event.preventDefault();

  if (!requireSession()) return;

  const body = $("postText")?.value.trim() || "";
  const postType = $("postType")?.value || "Discussion";
  const subject = $("postSubject")?.value || null;
  const file = $("postFile")?.files?.[0] || null;
  const button = $("postForm")?.querySelector('[type="submit"]');

  if (!body && !file) {
    notify("Write a post or choose a file to share.");
    return;
  }

  if (file && file.size > MAX_FILE_BYTES) {
    notify("Files must be 50 MB or smaller.");
    return;
  }

  if (file && file.type && !ALLOWED_MIME.has(file.type)) {
    notify("That file type is not supported.");
    return;
  }

  setButtonBusy(button, true, "Publishing…");

  let uploadedPath = null;

  try {
    if (file) {
      const safeName = safeFileName(file.name);
      uploadedPath =
        `${session.user.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("learning-files")
        .upload(uploadedPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });

      if (uploadError) throw uploadError;
    }

    const { error: insertError } = await supabase
      .from("posts")
      .insert({
        user_id: session.user.id,
        body,
        post_type: postType,
        subject,
        file_path: uploadedPath,
        file_name: file?.name || null,
        file_mime: file?.type || null,
        status: "published"
      });

    if (insertError) {
      if (uploadedPath) {
        await supabase.storage
          .from("learning-files")
          .remove([uploadedPath]);
      }

      throw insertError;
    }

    $("postForm")?.reset();
    $("composer")?.classList.add("hidden");

    activeView = "feed";
    await loadPosts();

    notify("Your learning post was published.");
  } catch (error) {
    console.error("Publish error:", error);
    notify("Could not publish post: " + error.message);
  } finally {
    setButtonBusy(button, false);
  }
}

/* =========================================================
   LIKES
   ========================================================= */

async function toggleLike(postId) {
  if (!requireSession()) return;

  const post = posts.find(item => String(item.id) === String(postId));
  if (!post) return;

  const currentlyLiked = (post.my_reaction || []).length > 0;

  try {
    if (currentlyLiked) {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", session.user.id);

      if (error) throw error;

      post.my_reaction = [];
      post.like_count = Math.max(0, (post.like_count || 0) - 1);
    } else {
      const { error } = await supabase
        .from("reactions")
        .insert({
          post_id: postId,
          user_id: session.user.id
        });

      if (error) throw error;

      post.my_reaction = [true];
      post.like_count = (post.like_count || 0) + 1;
    }

    renderPosts();
  } catch (error) {
    notify("Could not update like: " + error.message);
  }
}

/* =========================================================
   COMMENTS
   ========================================================= */

async function openComments(postId) {
  const section = $(`comments-${postId}`);
  if (!section) return;

  section.classList.toggle("show");

  if (!section.classList.contains("show")) return;
  if (!supabase) return;

  const list = $(`comment-list-${postId}`);
  if (!list) return;

  list.textContent = "Loading comments…";

  try {
    const { data, error } = await supabase
      .from("comments")
      .select("id,post_id,user_id,body,created_at,profiles:user_id(display_name)")
      .eq("post_id", postId)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    list.innerHTML = (data || []).length
      ? data.map(comment => `
          <div class="comment">
            <strong>${esc(comment.profiles?.display_name || "Member")}</strong>
            <p>${esc(comment.body || "").replace(/\n/g, "<br>")}</p>
            <small>${esc(timeAgo(comment.created_at))}</small>
          </div>
        `).join("")
      : '<p class="muted">No comments yet. Start the discussion.</p>';
  } catch (error) {
    list.textContent = "Could not load comments: " + error.message;
  }
}

async function submitComment(event, form) {
  event.preventDefault();

  if (!requireSession()) return;

  const postId = form.dataset.postId;
  const body = new FormData(form).get("body")?.toString().trim();

  if (!body) return;

  const button = form.querySelector('[type="submit"]');
  setButtonBusy(button, true, "Sending…");

  try {
    const { error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        user_id: session.user.id,
        body,
        status: "published"
      });

    if (error) throw error;

    form.reset();

    const section = $(`comments-${postId}`);
    section?.classList.add("show");

    await openComments(postId);
    await loadPosts();
  } catch (error) {
    notify("Could not send comment: " + error.message);
  } finally {
    setButtonBusy(button, false);
  }
}

/* =========================================================
   SHARE, REPOST, REPORT AND DELETE
   ========================================================= */

async function sharePost(postId) {
  const url = new URL(window.location.href);
  url.hash = `post-${postId}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: "LearnLoop learning resource",
        url: url.href
      });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.href);
      notify("Post link copied.");
    } else {
      window.prompt("Copy this post link:", url.href);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      notify("Could not share this post.");
    }
  }
}

async function repost(postId) {
  if (!requireSession()) return;

  const original = posts.find(item => String(item.id) === String(postId));
  if (!original) return;

  if (original.user_id === session.user.id) {
    notify("You cannot repost your own post.");
    return;
  }

  if (original.reposted_by_me) {
    notify("You have already reposted this resource.");
    return;
  }

  try {
    const { error } = await supabase
      .from("posts")
      .insert({
        user_id: session.user.id,
        body: original.body || "",
        post_type: original.post_type || "Discussion",
        subject: original.subject || null,
        file_path: original.file_path || null,
        file_name: original.file_name || null,
        file_mime: original.file_mime || null,
        repost_of: original.id,
        status: "published"
      });

    if (error) throw error;

    original.reposted_by_me = true;
    notify("Resource reposted.");
    await loadPosts();
  } catch (error) {
    notify("Could not repost: " + error.message);
  }
}

async function reportPost(postId) {
  if (!requireSession()) return;

  const reason = window.prompt(
    "Why are you reporting this post? Describe the concern briefly."
  );

  if (reason === null) return;

  if (!reason.trim()) {
    notify("Please enter a reason for the report.");
    return;
  }

  /*
   * The existing report table schema was not provided.
   * Do not guess its columns or write to an unknown table.
   */
  notify(
    "Please send this post ID and report reason to the LearnLoop moderator: " +
    postId + " — " + reason.trim()
  );
}

async function deletePost(postId) {
  if (!requireSession()) return;

  const post = posts.find(item => String(item.id) === String(postId));
  if (!post || post.user_id !== session.user.id) {
    notify("You can only delete your own posts.");
    return;
  }

  if (!window.confirm("Delete this post? This action cannot be undone.")) {
    return;
  }

  try {
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", session.user.id);

    if (error) throw error;

    notify("Post deleted.");
    await loadPosts();
  } catch (error) {
    notify("Could not delete post: " + error.message);
  }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function showView(view) {
  if (!VIEW_TITLES[view]) view = "feed";

  activeView = view;
  activeSubject = null;

  document.body.classList.toggle("library-mode", view === "library");
  document.body.classList.toggle("following-mode", view === "following");

  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if ($("feedTitle")) {
    $("feedTitle").textContent = VIEW_TITLES[view];
  }

  const libraryView = $("libraryView");
  const followingView = $("followingView");
  const feed = $("feed");

  libraryView?.classList.toggle("hidden", view !== "library");
  followingView?.classList.toggle("hidden", view !== "following");
  feed?.classList.toggle("hidden", view !== "feed");

  $("composer")?.classList.toggle("hidden", view !== "feed");

  document.querySelector(".main")?.classList.toggle(
    "following-main",
    view === "following"
  );

  document.querySelectorAll("[data-subject]").forEach(button => {
    button.classList.remove("selected");
  });

  if (view === "feed") {
    loadPosts();
  } else if (view === "saved") {
    notify("Saved resources need a saved-items database table to work.");
  } else if (view === "discussions") {
    notify("Private discussions require a configured messaging backend.");
  } else if (view === "notifications") {
    notify("Notifications need a configured notifications backend.");
  } else if (view === "dashboard") {
    notify("Your learning dashboard is ready for lessons and progress features.");
  }
}

/* =========================================================
   LEARNING LIBRARY
   ========================================================= */

(() => {
  const subjects = $("librarySubjects");
  const details = $("librarySubjectDetails");

  if (!subjects || !details) return;

  const libraryContent = {
    Science: {
      Biology: [
        "Cells and their functions",
        "Human body systems",
        "Plants and photosynthesis"
      ],
      Chemistry: [
        "Atoms and elements",
        "Acids and bases",
        "Chemical reactions"
      ],
      Physics: [
        "Force and motion",
        "Energy",
        "Electricity"
      ]
    },
    Technology: {
      "Computer Basics": [
        "Computer components",
        "Operating systems",
        "Internet safety"
      ],
      Coding: [
        "Introduction to programming",
        "Variables and data",
        "Web development"
      ],
      "Digital Skills": [
        "Using email",
        "Online research",
        "Digital citizenship"
      ]
    },
    Languages: {
      English: [
        "Grammar basics",
        "Reading comprehension",
        "Writing skills"
      ],
      French: [
        "Les salutations",
        "La grammaire",
        "La compréhension écrite"
      ],
      Kinyarwanda: [
        "Gusoma no kwandika",
        "Ikibonezamvugo",
        "Gusobanura amagambo"
      ]
    },
    Mathematics: {
      Algebra: [
        "Expressions",
        "Equations",
        "Linear functions"
      ],
      Geometry: [
        "Angles and lines",
        "Triangles",
        "Area and volume"
      ],
      Statistics: [
        "Collecting data",
        "Averages",
        "Charts and graphs"
      ]
    },
    Business: {
      Entrepreneurship: [
        "Business ideas",
        "Business planning",
        "Marketing basics"
      ],
      Management: [
        "Planning and organizing",
        "Leadership",
        "Teamwork"
      ],
      Accounting: [
        "Introduction to accounting",
        "Income and expenses",
        "Budgets"
      ]
    },
    "General Studies": {
      "Health Education": [
        "Personal hygiene",
        "Nutrition",
        "Disease prevention"
      ],
      Citizenship: [
        "Rights and responsibilities",
        "Community participation",
        "Respect and tolerance"
      ],
      "Research Skills": [
        "Finding information",
        "Evaluating sources",
        "Writing a report"
      ]
    }
  };

  function showSubjects() {
    subjects.classList.remove("hidden");
    details.classList.add("hidden");
    details.replaceChildren();
  }

  function showSubject(subject) {
    const topics = libraryContent[subject];
    if (!topics) return;

    subjects.classList.add("hidden");
    details.classList.remove("hidden");

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "library-green-button";
    backButton.textContent = "← All subjects";
    backButton.addEventListener("click", showSubjects);

    const title = document.createElement("h2");
    title.textContent = subject;

    const description = document.createElement("p");
    description.textContent = "Choose a topic to explore its lesson outline.";

    const grid = document.createElement("div");
    grid.className = "library-book-grid";

    const lessonContainer = document.createElement("div");

    for (const [topic, lessons] of Object.entries(topics)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "library-book";

      const icon = document.createElement("div");
      icon.className = "book-cover";
      icon.textContent = "📘";

      const topicTitle = document.createElement("h4");
      topicTitle.textContent = topic;

      const count = document.createElement("p");
      count.textContent = `${lessons.length} lesson topics`;

      button.append(icon, topicTitle, count);

      button.addEventListener("click", () => {
        lessonContainer.replaceChildren();

        const lessonTitle = document.createElement("h3");
        lessonTitle.textContent = topic;

        const intro = document.createElement("p");
        intro.textContent = "Lesson topics to study:";

        const list = document.createElement("ol");

        lessons.forEach(lesson => {
          const item = document.createElement("li");
          item.textContent = lesson;
          item.style.margin = "12px 0";
          list.appendChild(item);
        });

        const note = document.createElement("p");
        note.className = "muted";
        note.textContent =
          "These are lesson outlines. Full notes can be added next.";

        lessonContainer.append(lessonTitle, intro, list, note);
        lessonContainer.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });

      grid.appendChild(button);
    }

    details.replaceChildren(
      backButton,
      title,
      description,
      grid,
      lessonContainer
    );
  }

  subjects.querySelectorAll("[data-library-subject]").forEach(button => {
    button.addEventListener("click", () => {
      showSubject(button.dataset.librarySubject);
    });
  });
})();

/* =========================================================
   OPEN LIBRARY BOOK SEARCH
   ========================================================= */

(() => {
  const search = $("librarySearch");
  const results = $("googleBooksResults");
  const status = $("googleBooksStatus");

  if (!search || !results || !status) return;

  let timer = null;
  let requestNumber = 0;

  async function searchOpenLibrary(query) {
    const current = ++requestNumber;
    results.replaceChildren();

    if (!query.trim()) {
      status.textContent = "Search for a book, author, or subject above.";
      return;
    }

    status.textContent = "Searching Open Library…";

    try {
      const url = new URL("https://openlibrary.org/search.json");
      url.searchParams.set("q", query.trim());
      url.searchParams.set("limit", "12");
      url.searchParams.set(
        "fields",
        "key,title,author_name,first_publish_year,cover_i,ebook_access,has_fulltext"
      );

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Book search failed (${response.status}).`);
      }

      const data = await response.json();
      if (current !== requestNumber) return;

      const books = data.docs || [];

      if (!books.length) {
        status.textContent = "No books found. Try another search.";
        return;
      }

      status.textContent =
        `Found ${Number(data.numFound || books.length).toLocaleString()} records. Showing ${books.length}.`;

      books.forEach(book => {
        const card = document.createElement("article");
        card.className = "library-book";

        const cover = document.createElement("div");
        cover.className = "book-cover";
        cover.textContent = "📘";

        if (book.cover_i) {
          const img = document.createElement("img");
          img.src =
            `https://covers.openlibrary.org/b/id/${encodeURIComponent(book.cover_i)}-M.jpg`;
          img.alt = `Cover of ${book.title || "book"}`;
          img.loading = "lazy";
          img.style.cssText =
            "max-width:100%;max-height:150px;object-fit:contain";

          img.addEventListener("error", () => {
            img.remove();
            cover.textContent = "📘";
          });

          cover.replaceChildren(img);
        }

        const title = document.createElement("h4");
        title.textContent = book.title || "Untitled book";

        const author = document.createElement("p");
        author.textContent = (book.author_name || ["Author not listed"])
          .slice(0, 3)
          .join(", ");

        card.append(cover, title, author);

        if (book.first_publish_year) {
          const year = document.createElement("p");
          year.textContent = `First published: ${book.first_publish_year}`;
          card.appendChild(year);
        }

        const access = document.createElement("p");
        access.textContent = ({
          borrowable: "Online borrowing may be available.",
          public: "Online reading may be available.",
          printdisabled: "Access may be restricted.",
          no_ebook: "No online edition listed."
        })[book.ebook_access] || "Check available access options.";

        card.appendChild(access);

        if (book.key) {
          const link = document.createElement("a");
          link.href = `https://openlibrary.org${book.key}`;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "View book details ↗";
          card.appendChild(link);
        }

        results.appendChild(card);
      });
    } catch (error) {
      if (current !== requestNumber) return;
      status.textContent = error.message || "Unable to load books.";
    }
  }

  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => searchOpenLibrary(search.value),
      500
    );
  });
})();

/* =========================================================
   GOOGLE BOOKS PREVIEW
   ========================================================= */

function openPreview(bookId) {
  const viewer = $("googleBooksViewer");
  const preview = $("googleBooksPreview");

  if (!viewer || !preview || !bookId) {
    notify("This book preview is unavailable.");
    return;
  }

  viewer.hidden = false;
  preview.replaceChildren();

  const frame = document.createElement("iframe");
  const params = new URLSearchParams({
    id: bookId,
    printsec: "frontcover",
    output: "embed"
  });

  frame.src = "https://books.google.com/books?" + params.toString();
  frame.title = "Google Books preview inside LearnLoop";
  frame.style.cssText =
    "width:100%;height:650px;border:1px solid #d1ead9;border-radius:12px";
  frame.loading = "lazy";
  frame.setAttribute("allowfullscreen", "");

  preview.appendChild(frame);

  viewer.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

$("closeGoogleBook")?.addEventListener("click", () => {
  const viewer = $("googleBooksViewer");
  const preview = $("googleBooksPreview");

  if (preview) preview.replaceChildren();
  if (viewer) viewer.hidden = true;
});

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

$("loginTab")?.addEventListener("click", () => {
  authMode = "login";
  updateAuthMode();
});

$("signupTab")?.addEventListener("click", () => {
  authMode = "signup";
  updateAuthMode();
});

$("authForm")?.addEventListener("submit", authSubmit);
$("postForm")?.addEventListener("submit", publishPost);
$("profileForm")?.addEventListener("submit", saveProfile);
$("revenueSettingsForm")?.addEventListener("submit", saveRevenueSettings);

$("hostDashboardButton")?.addEventListener(
  "click",
  openHostDashboard
);

$("newPostTop")?.addEventListener("click", () => {
  if (!requireSession()) return;

  showView("feed");
  $("composer")?.classList.remove("hidden");
  $("composer")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
  $("postText")?.focus();
});

$("heroCreate")?.addEventListener("click", () => {
  if (!requireSession()) return;

  showView("feed");
  $("composer")?.classList.remove("hidden");
  $("composer")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
  $("postText")?.focus();
});

$("cancelPost")?.addEventListener("click", () => {
  $("composer")?.classList.add("hidden");
});

$("profileButton")?.addEventListener("click", () => {
  if (!session) return showAuth("login");
  openProfile();
});

$("accountButton")?.addEventListener("click", () => {
  if (!session) return showAuth("login");
  openProfile();
});

$("signOut")?.addEventListener("click", signOut);

$("searchInput")?.addEventListener("input", renderPosts);
$("sortSelect")?.addEventListener("change", renderPosts);

document.querySelectorAll("[data-subject]").forEach(button => {
  button.addEventListener("click", () => {
    const subject = button.dataset.subject;

    activeSubject = activeSubject === subject ? null : subject;

    document.querySelectorAll("[data-subject]").forEach(item => {
      item.classList.toggle(
        "selected",
        item.dataset.subject === activeSubject
      );
    });

    if ($("feedTitle")) {
      $("feedTitle").textContent = activeSubject
        ? `${activeSubject} resources`
        : VIEW_TITLES.feed;
    }

    showView("feed");
  });
});

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});

$("feed")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const postId = button.dataset.id;
  const action = button.dataset.action;

  if (action === "like") return toggleLike(postId);
  if (action === "comment") return openComments(postId);
  if (action === "share") return sharePost(postId);
  if (action === "repost") return repost(postId);
  if (action === "report") return reportPost(postId);
  if (action === "delete") return deletePost(postId);
});

$("feed")?.addEventListener("submit", async event => {
  const form = event.target.closest(".comment-form");
  if (!form) return;

  await submitComment(event, form);
});

document.addEventListener("click", event => {
  const backButton = event.target.closest("#libraryBackHome");
  if (!backButton) return;

  event.preventDefault();
  showView("feed");
});

(() => {
  const compactBar = $("compactSidebar");
  if (!compactBar) return;

  window.addEventListener("scroll", () => {
    compactBar.classList.toggle("visible", window.scrollY > 180);
  }, { passive: true });

  compactBar.querySelectorAll("button[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });
})();

/* =========================================================
   AUTH STATE AND INITIAL STARTUP
   ========================================================= */

if (supabase) {
  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;

    setTimeout(() => {
      refreshSession();
    }, 0);
  });
}

updateAuthMode();
updateAccountUI();
refreshSession();
