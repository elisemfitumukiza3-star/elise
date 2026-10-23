import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./src/config.js";

/* =========================================================
   LEARNLOOP — COMPLETE APPLICATION
   Existing Supabase project and database are preserved.
   ========================================================= */

const configured =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_ANON_KEY.length > 30 &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: { params: { eventsPerSecond: 5 } }
    })
  : null;

window.learnLoopSupabase = supabase;

const $ = id => document.getElementById(id);

let session = null;
let profile = null;
let posts = [];
let activeView = "feed";
let activeSubject = null;
let authMode = "login";
let isPlatformOwner = false;
let feedChannel = null;
let loadingPosts = false;
let pageHistory = ["feed"];

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

const VIEW_INFO = {
  feed: {
    title: "Home",
    subtitle: "Discover and share learning resources.",
    icon: "⌂"
  },
  following: {
    title: "Following",
    subtitle: "Resources from people you follow."
  },
  library: {
    title: "Learning Library",
    subtitle: "Explore subjects, lessons, and books."
  },
  discussions: {
    title: "Discussions",
    subtitle: "Questions, answers, and educational conversations."
  },
  community: {
    title: "Community",
    subtitle: "Connect through shared learning."
  },
  saved: {
    title: "Saved Resources",
    subtitle: "Keep useful learning materials close at hand."
  },
  profile: {
    title: "My Profile",
    subtitle: "Manage your LearnLoop account."
  },
  notifications: {
    title: "Notifications",
    subtitle: "Updates about your learning activity."
  },
  dashboard: {
    title: "Learning Dashboard",
    subtitle: "Review your contributions and activity."
  },
  uploads: {
    title: "My Uploads",
    subtitle: "Find the resources you have published."
  },
  host: {
    title: "Host Dashboard",
    subtitle: "Private platform management."
  }
};

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
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

function setStatus(message, error = false) {
  const el = $("status");
  if (!el) return;

  el.textContent = message;
  el.classList.toggle("error", error);
}

function requireConfig() {
  if (supabase) return true;
  notify("The Supabase configuration could not be loaded.");
  return false;
}

function requireSession() {
  if (!requireConfig()) return false;

  if (!session) {
    showAuth("login");
    return false;
  }

  return true;
}

function closeDialog(id) {
  const el = $(id);
  if (el?.open) el.close();
}

function showDialog(id) {
  const el = $(id);
  if (!el) return;

  if (typeof el.showModal === "function") {
    if (!el.open) el.showModal();
  } else {
    el.classList.remove("hidden");
  }
}

function setBusy(button, busy, label = "Please wait…") {
  if (!button) return;

  if (busy) {
    button.dataset.oldText = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    if (button.dataset.oldText) {
      button.textContent = button.dataset.oldText;
      delete button.dataset.oldText;
    }
  }
}

function timeAgo(date) {
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/* =========================================================
   PAGE SYSTEM
   Creates independent views without losing the existing
   application shell or reloading the whole website.
   ========================================================= */

function ensurePageHost() {
  let host = $("learnLoopPage");

  if (!host) {
    const main = document.querySelector(".main") ||
      document.querySelector("main") ||
      document.body;

    host = document.createElement("section");
    host.id = "learnLoopPage";
    host.className = "learnloop-page";
    host.style.cssText = "width:100%;min-width:0";
    main.appendChild(host);
  }

  return host;
}

function ensurePageStyles() {
  if ($("learnLoopPageStyles")) return;

  const style = document.createElement("style");
  style.id = "learnLoopPageStyles";
  style.textContent = `
    .learnloop-page { padding:20px 0; }
    .ll-page-heading { margin:0 0 8px; font-size:clamp(24px,3vw,34px); }
    .ll-page-subtitle { margin:0 0 22px; color:var(--muted,#697386); }
    .ll-page-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
    .ll-card { padding:18px; border:1px solid var(--border,#e3e7eb); border-radius:16px; background:var(--card,#fff); margin-bottom:14px; }
    .ll-card h3 { margin-top:0; }
    .ll-card button,.ll-card a { margin-top:10px; }
    .ll-empty { padding:26px; text-align:center; border:1px dashed var(--border,#d9dfe5); border-radius:14px; }
    .ll-back { margin:0 0 18px; }
    .ll-action-row { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px; }
    .ll-action-row button { cursor:pointer; }
    .ll-resource-link { display:inline-block; margin-top:10px; }
    .ll-page-form { display:grid; gap:12px; }
    .ll-page-form input,.ll-page-form textarea,.ll-page-form select { width:100%; box-sizing:border-box; padding:12px; border:1px solid var(--border,#d9dfe5); border-radius:10px; }
    .ll-muted { color:var(--muted,#697386); }
    .ll-subject-list { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:18px; }
    .ll-subject-list button { padding:10px 14px; border-radius:10px; cursor:pointer; }
    @media(max-width:640px) { .learnloop-page { padding:12px 0; } .ll-card { padding:14px; } }
  `;
  document.head.appendChild(style);
}

function hideOriginalContent() {
  [
    "feed",
    "libraryView",
    "followingView"
  ].forEach(id => {
    const el = $(id);
    if (el) el.classList.add("hidden");
  });

  $("composer")?.classList.add("hidden");
}

function navigate(view, options = {}) {
  if (!VIEW_INFO[view]) view = "feed";

  if (view === "host" && !isPlatformOwner) {
    if (!requireSession()) return;
    notify("Host settings are restricted to the platform owner.");
    return;
  }

  if (view === "profile" && !session) {
    showAuth("login");
    return;
  }

  if (!options.replaceHistory && pageHistory.at(-1) !== view) {
    pageHistory.push(view);
  }

  activeView = view;
  activeSubject = null;

  document.body.dataset.learnloopView = view;
  document.body.classList.toggle("library-mode", view === "library");
  document.body.classList.toggle("following-mode", view === "following");

  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
    button.setAttribute(
      "aria-current",
      button.dataset.view === view ? "page" : "false"
    );
  });

  if ($("feedTitle")) $("feedTitle").textContent = VIEW_INFO[view].title;

  hideOriginalContent();
  ensurePageStyles();

  const host = ensurePageHost();
  host.classList.remove("hidden");
  host.innerHTML = pageShell(view);

  if (view === "feed") renderHomePage();
  else if (view === "following") renderFollowingPage();
  else if (view === "library") renderLibraryPage();
  else if (view === "discussions") renderDiscussionPage();
  else if (view === "community") renderCommunityPage();
  else if (view === "saved") renderSavedPage();
  else if (view === "profile") renderProfilePage();
  else if (view === "notifications") renderNotificationsPage();
  else if (view === "dashboard") renderDashboardPage();
  else if (view === "uploads") renderUploadsPage();
  else if (view === "host") renderHostPage();

  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function pageShell(view) {
  const info = VIEW_INFO[view];

  return `
    <header class="ll-page-header">
      <h1 class="ll-page-heading">${esc(info.title)}</h1>
      <p class="ll-page-subtitle">${esc(info.subtitle)}</p>
    </header>
    <div id="llPageContent"></div>
  `;
}

function pageContent() {
  return $("llPageContent");
}

function showEmpty(title, description, buttonText = "", action = "") {
  const content = pageContent();
  if (!content) return;

  content.innerHTML = `
    <section class="ll-empty">
      <h3>${esc(title)}</h3>
      <p>${esc(description)}</p>
      ${buttonText
        ? `<button type="button" class="primary" data-page-action="${esc(action)}">${esc(buttonText)}</button>`
        : ""}
    </section>
  `;
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
    $("authTitle").textContent = signup ? "Join LearnLoop" : "Welcome back";
  }

  if ($("authIntro")) {
    $("authIntro").textContent = signup
      ? "Create an account to share and discover learning resources."
      : "Sign in to join the educational community.";
  }

  $("nameWrap")?.classList.toggle("hidden", !signup);

  if ($("displayName")) $("displayName").required = signup;
  if ($("password")) {
    $("password").autocomplete = signup ? "new-password" : "current-password";
  }

  if ($("authSubmit")) {
    $("authSubmit").textContent = signup ? "Create account" : "Sign in";
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
  const button = $("authSubmit");
  const message = $("authMessage");

  if (!email || !password) {
    if (message) message.textContent = "Enter your email and password.";
    return;
  }

  if (authMode === "signup" && !displayName) {
    if (message) message.textContent = "Enter your display name.";
    return;
  }

  setBusy(button, true);

  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } }
      });

      if (error) throw error;

      if (data.session) {
        session = data.session;
        closeDialog("authDialog");
        await refreshSession();
        notify("Welcome to LearnLoop!");
      } else if (message) {
        message.textContent =
          "Account created. Check your email for verification, then sign in.";
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
    setBusy(button, false);
  }
}

/* =========================================================
   PROFILE AND SESSION
   ========================================================= */

async function refreshSession() {
  if (!supabase) {
    updateAccountUI();
    navigate("feed", { replaceHistory: true });
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

    if (activeView === "profile") renderProfilePage();
    if (activeView === "dashboard") renderDashboardPage();
  } catch (error) {
    console.error("Session refresh failed:", error);
    notify("Could not refresh your session. Reload the page and try again.");
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
  $("hostDashboardButton")?.classList.toggle("hidden", !isPlatformOwner);

  const name = profile?.display_name || session?.user?.email || "";

  if ($("accountButton")) {
    $("accountButton").textContent = session
      ? name.split(/\s+/).slice(0, 2)
          .map(part => part[0] || "")
          .join("").toUpperCase() || "ME"
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

  Object.entries(fields).forEach(([id, value]) => {
    if ($(id)) $(id).value = value;
  });

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
  setBusy(button, true, "Saving…");

  try {
    const { error } = await supabase.from("profiles").upsert(payload);
    if (error) throw error;

    await loadProfile();
    updateAccountUI();
    closeDialog("profileDialog");

    if (activeView === "profile") renderProfilePage();
    notify("Profile updated successfully.");
  } catch (error) {
    notify("Could not save profile: " + error.message);
  } finally {
    setBusy(button, false);
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
  posts = [];
  navigate("feed");
  notify("Signed out.");
}

async function loadOwnerAccess() {
  isPlatformOwner = false;

  if (!supabase || !session) {
    $("hostDashboardButton")?.classList.add("hidden");
    return;
  }

  const { data, error } = await supabase.rpc("is_platform_owner");
  isPlatformOwner = !error && data === true;

  $("hostDashboardButton")?.classList.toggle("hidden", !isPlatformOwner);
}

/* =========================================================
   HOST DASHBOARD
   ========================================================= */

async function loadHostSettings() {
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
    : [];

  if ($("revAds")) $("revAds").checked = methods.includes("ads");
  if ($("revSponsors")) $("revSponsors").checked = methods.includes("sponsorships");
  if ($("revReferrals")) $("revReferrals").checked = methods.includes("referrals");
  if ($("revSupport")) $("revSupport").checked = methods.includes("support");
  if ($("adPlacement")) $("adPlacement").value = data.ad_placement || "limited";

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
  if ($("revSponsors")?.checked) enabled_methods.push("sponsorships");
  if ($("revReferrals")?.checked) enabled_methods.push("referrals");
  if ($("revSupport")?.checked) enabled_methods.push("support");

  const message = $("revenueSettingsMessage");

  if (!enabled_methods.length) {
    if (message) message.textContent = "Select at least one revenue method.";
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
    if (message) message.textContent = "Could not save settings: " + error.message;
  }
}

/* =========================================================
   POSTS, MEDIA, FEED
   ========================================================= */

async function hydratePostFiles(items) {
  if (!supabase) return items;

  return Promise.all(items.map(async post => {
    if (!post.file_path) return post;

    const { data, error } = await supabase.storage
      .from("learning-files")
      .createSignedUrl(post.file_path, 1800);

    if (error) console.warn("Attachment URL error:", error.message);

    return { ...post, signedUrl: data?.signedUrl || null };
  }));
}

function mediaHtml(post) {
  if (!post.file_path) return "";

  const filename = esc(post.file_name || "Learning resource");

  if (!post.signedUrl) {
    return `<div class="attachment"><strong>${filename}</strong><small>Attachment unavailable</small></div>`;
  }

  const url = esc(post.signedUrl);
  const mime = post.file_mime || "";

  if (mime.startsWith("image/")) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">
      <img class="post-media" src="${url}" alt="${filename}" loading="lazy">
    </a>`;
  }

  if (mime.startsWith("video/")) {
    return `<video class="post-media" controls preload="metadata" src="${url}"></video>`;
  }

  return `<a class="attachment" href="${url}" target="_blank" rel="noopener noreferrer">
    <strong>${filename}</strong><small>Open or download resource</small>
  </a>`;
}

function postHtml(post) {
  const liked = (post.my_reaction || []).length > 0;
  const reposted = !!post.reposted_by_me;
  const name = post.profiles?.display_name || "LearnLoop member";
  const initials = name.split(/\s+/).slice(0, 2)
    .map(part => part[0] || "").join("").toUpperCase() || "LL";
  const isOwner = session?.user?.id === post.user_id;

  return `
    <article class="post" data-post-id="${esc(post.id)}">
      ${post.repost_of ? '<div class="repost-label">⟳ Reposted resource</div>' : ""}
      <div class="post-header">
        <div class="avatar">${esc(initials)}</div>
        <div class="author-block">
          <strong>${esc(name)}</strong>
          <small>${esc(post.profiles?.bio || post.subject || "Community member")} · ${esc(timeAgo(post.created_at))}</small>
        </div>
        <span class="tag">${esc(post.post_type || "Discussion")}</span>
      </div>
      <div class="post-text">${esc(post.body || "").replace(/\n/g, "<br>")}</div>
      ${post.subject ? `<span class="subject-tag">${esc(post.subject)}</span>` : ""}
      ${mediaHtml(post)}
      <div class="post-stats">
        ${post.like_count || 0} likes · ${post.comment_count || 0} comments · ${post.repost_count || 0} reposts
      </div>
      <div class="post-actions">
        <button type="button" class="action ${liked ? "liked" : ""}" data-action="like" data-id="${esc(post.id)}">${liked ? "♥ Liked" : "♡ Like"}</button>
        <button type="button" class="action" data-action="comment" data-id="${esc(post.id)}">Comment</button>
        <button type="button" class="action" data-action="share" data-id="${esc(post.id)}">Share</button>
        <button type="button" class="action" data-action="repost" data-id="${esc(post.id)}">${reposted ? "✓ Reposted" : "⟳ Repost"}</button>
        <button type="button" class="action" data-action="report" data-id="${esc(post.id)}">Report</button>
        ${isOwner ? `<button type="button" class="action" data-action="delete" data-id="${esc(post.id)}">Delete</button>` : ""}
      </div>
      <section class="comments" id="comments-${esc(post.id)}">
        <div class="comment-list" id="comment-list-${esc(post.id)}"></div>
        <form class="comment-form" data-post-id="${esc(post.id)}">
          <input name="body" maxlength="2000" required placeholder="Write a helpful comment..." aria-label="Comment">
          <button type="submit" class="primary">Send</button>
        </form>
      </section>
    </article>
  `;
}

async function loadPosts() {
  if (!supabase || loadingPosts) return;

  loadingPosts = true;

  try {
    let query = supabase
      .from("posts")
      .select("*, profiles:user_id(display_name,bio)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);

    if (activeSubject) query = query.eq("subject", activeSubject);

    const { data, error } = await query;
    if (error) throw error;

    let loaded = data || [];

    if (session && loaded.length) {
      const ids = loaded.map(post => post.id);

      const [likes, reposts, comments] = await Promise.all([
        supabase.from("reactions").select("post_id")
          .eq("user_id", session.user.id).in("post_id", ids),
        supabase.from("posts").select("repost_of")
          .eq("user_id", session.user.id).in("repost_of", ids),
        supabase.from("comments").select("post_id")
          .in("post_id", ids).eq("status", "published")
      ]);

      const likeSet = new Set((likes.data || []).map(x => x.post_id));
      const repostSet = new Set((reposts.data || []).map(x => x.repost_of));
      const counts = {};

      (comments.data || []).forEach(c => {
        counts[c.post_id] = (counts[c.post_id] || 0) + 1;
      });

      loaded = loaded.map(post => ({
        ...post,
        my_reaction: likeSet.has(post.id) ? [true] : [],
        reposted_by_me: repostSet.has(post.id),
        comment_count: counts[post.id] || 0
      }));
    } else {
      loaded = loaded.map(post => ({
        ...post,
        my_reaction: [],
        reposted_by_me: false
      }));
    }

    posts = await hydratePostFiles(loaded);

    if (activeView === "feed") renderHomePage();
    if (activeView === "following") renderFollowingPage();
    if (activeView === "discussions") renderDiscussionPage();
    if (activeView === "community") renderCommunityPage();
    if (activeView === "uploads") renderUploadsPage();
    if (activeView === "dashboard") renderDashboardPage();

    if (!feedChannel) {
      feedChannel = supabase
        .channel("learnloop-post-feed")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "posts"
        }, () => {
          if (!loadingPosts) loadPosts();
        })
        .subscribe();
    }
  } catch (error) {
    console.error("Could not load posts:", error);
    setStatus("Could not load posts: " + error.message, true);
  } finally {
    loadingPosts = false;
  }
}

function filteredPosts() {
  const term = $("searchInput")?.value.trim().toLowerCase() || "";
  const sort = $("sortSelect")?.value || "latest";

  let list = [...posts].filter(post => {
    const text = [
      post.body, post.subject, post.post_type,
      post.profiles?.display_name, post.file_name
    ].join(" ").toLowerCase();

    return !term || text.includes(term);
  });

  if (sort === "popular") {
    list.sort((a, b) =>
      ((b.like_count || 0) + (b.repost_count || 0)) -
      ((a.like_count || 0) + (a.repost_count || 0))
    );
  }

  return list;
}

function renderPostList(list, container = pageContent()) {
  if (!container) return;

  container.innerHTML = list.length
    ? list.map(postHtml).join("")
    : `<div class="ll-empty"><h3>No posts to show yet</h3><p>Share a learning resource or try another section.</p></div>`;
}

function renderHomePage() {
  const content = pageContent();
  if (!content) return;

  content.innerHTML = `
    <div class="ll-action-row">
      <button type="button" class="primary" data-page-action="new-post">＋ Create a post</button>
      <button type="button" data-page-action="library">Browse Library</button>
    </div>
    <div id="llHomeComposer" class="ll-card hidden">
      <form id="llPostForm" class="ll-page-form">
        <textarea id="llPostText" rows="4" maxlength="10000" placeholder="Share a question, learning tip, or resource..."></textarea>
        <select id="llPostType">
          <option>Discussion</option><option>Question</option><option>Learning tip</option>
          <option>Document</option><option>Photo</option><option>Video</option><option>Story</option>
        </select>
        <input id="llPostSubject" placeholder="Subject (optional)">
        <input id="llPostFile" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.xls,.xlsx,image/*,video/mp4,video/webm,video/quicktime">
        <div class="ll-action-row">
          <button type="submit" class="primary">Publish post</button>
          <button type="button" data-page-action="cancel-post">Cancel</button>
        </div>
      </form>
    </div>
    <div id="llPostFeed"></div>
  `;

  renderPostList(filteredPosts(), $("llPostFeed"));
}

function renderFollowingPage() {
  const list = session
    ? posts.filter(post => post.user_id === session.user.id)
    : [];

  const content = pageContent();
  if (!content) return;

  content.innerHTML = `
    <div class="ll-card">
      <p>Your own posts are shown here for now. A true following feed requires a following/follower relationship table.</p>
    </div>
    <div id="llFollowingPosts"></div>
  `;

  renderPostList(list, $("llFollowingPosts"));
}

function renderDiscussionPage() {
  const list = posts.filter(post =>
    ["discussion", "question", "learning tip"].includes(
      String(post.post_type || "").toLowerCase()
    )
  );
  renderPostList(list);
}

function renderCommunityPage() {
  const content = pageContent();
  if (!content) return;

  content.innerHTML = `
    <div class="ll-card">
      <h3>Learn together</h3>
      <p>Browse published learning posts and join the discussion through comments.</p>
      <button type="button" class="primary" data-page-action="new-post">Share with the community</button>
    </div>
    <div id="llCommunityPosts"></div>
  `;

  renderPostList(filteredPosts(), $("llCommunityPosts"));
}

function renderUploadsPage() {
  if (!session) {
    showEmpty("Sign in required", "Sign in to view your uploaded posts.", "Sign in", "login");
    return;
  }

  renderPostList(posts.filter(post => post.user_id === session.user.id));
}

function renderDashboardPage() {
  const content = pageContent();
  if (!content) return;

  if (!session) {
    showEmpty("Your learning dashboard", "Sign in to review your activity.", "Sign in", "login");
    return;
  }

  const mine = posts.filter(post => post.user_id === session.user.id);
  const resources = mine.filter(post => post.file_path).length;
  const comments = mine.reduce((total, post) => total + (post.comment_count || 0), 0);

  content.innerHTML = `
    <div class="ll-page-grid">
      <article class="ll-card"><h3>${mine.length}</h3><p>Published posts</p></article>
      <article class="ll-card"><h3>${resources}</h3><p>Posts with files</p></article>
      <article class="ll-card"><h3>${comments}</h3><p>Comments on your posts</p></article>
    </div>
    <div class="ll-action-row">
      <button type="button" class="primary" data-page-action="uploads">My Uploads</button>
      <button type="button" data-page-action="profile">My Profile</button>
    </div>
    <h3>Your recent posts</h3>
    <div id="llDashboardPosts"></div>
  `;

  renderPostList(mine, $("llDashboardPosts"));
}

function renderProfilePage() {
  const content = pageContent();
  if (!content) return;

  if (!session) {
    showEmpty("My Profile", "Sign in to view and edit your profile.", "Sign in", "login");
    return;
  }

  const name = profile?.display_name || "LearnLoop member";
  const mine = posts.filter(post => post.user_id === session.user.id);

  content.innerHTML = `
    <article class="ll-card">
      <h2>${esc(name)}</h2>
      <p>${esc(profile?.bio || "Add a short introduction about yourself.")}</p>
      <p class="ll-muted">${esc(profile?.institution || "")}</p>
      <p class="ll-muted">${esc(profile?.study_level || "")}</p>
      <button type="button" class="primary" data-page-action="edit-profile">Edit profile</button>
    </article>
    <h3>Your posts (${mine.length})</h3>
    <div id="llProfilePosts"></div>
  `;

  renderPostList(mine, $("llProfilePosts"));
}

function renderSavedPage() {
  const content = pageContent();
  if (!content) return;

  content.innerHTML = `
    <div class="ll-card">
      <h3>Save resources for later</h3>
      <p>Saved resources need a dedicated saved-items table in your Supabase database. This page is ready for that integration, but it will not pretend that posts are saved yet.</p>
      <button type="button" class="primary" data-page-action="feed">Browse learning feed</button>
    </div>
  `;
}

function renderNotificationsPage() {
  showEmpty(
    "Notifications",
    "This page is separate and ready for notification integration. Persistent alerts require a notifications table and appropriate database permissions.",
    "Return to Home",
    "feed"
  );
}

/* =========================================================
   LEARNING LIBRARY
   ========================================================= */

const LIBRARY = {
  Science: {
    Biology: ["Cells and their functions", "Human body systems", "Plants and photosynthesis"],
    Chemistry: ["Atoms and elements", "Acids and bases", "Chemical reactions"],
    Physics: ["Force and motion", "Energy", "Electricity"]
  },
  Technology: {
    "Computer Basics": ["Computer components", "Operating systems", "Internet safety"],
    Coding: ["Introduction to programming", "Variables and data", "Web development"],
    "Digital Skills": ["Using email", "Online research", "Digital citizenship"]
  },
  Languages: {
    English: ["Grammar basics", "Reading comprehension", "Writing skills"],
    French: ["Les salutations", "La grammaire", "La compréhension écrite"],
    Kinyarwanda: ["Gusoma no kwandika", "Ikibonezamvugo", "Gusobanura amagambo"]
  },
  Mathematics: {
    Algebra: ["Expressions", "Equations", "Linear functions"],
    Geometry: ["Angles and lines", "Triangles", "Area and volume"],
    Statistics: ["Collecting data", "Averages", "Charts and graphs"]
  },
  Business: {
    Entrepreneurship: ["Business ideas", "Business planning", "Marketing basics"],
    Management: ["Planning and organizing", "Leadership", "Teamwork"],
    Accounting: ["Introduction to accounting", "Income and expenses", "Budgets"]
  },
  "General Studies": {
    "Health Education": ["Personal hygiene", "Nutrition", "Disease prevention"],
    Citizenship: ["Rights and responsibilities", "Community participation", "Respect and tolerance"],
    "Research Skills": ["Finding information", "Evaluating sources", "Writing a report"]
  }
};

function renderLibraryPage() {
  const content = pageContent();
  if (!content) return;

  content.innerHTML = `
    <div class="ll-card">
      <h3>Find a book</h3>
      <form id="llBookSearch" class="ll-page-form">
        <input id="llBookQuery" placeholder="Search books, authors, or subjects">
        <button type="submit" class="primary">Search books</button>
      </form>
      <p id="llBookStatus" class="ll-muted">Search public book records from Open Library.</p>
      <div id="llBookResults" class="ll-page-grid"></div>
    </div>
    <h3>Explore subjects</h3>
    <div class="ll-subject-list">
      ${Object.keys(LIBRARY).map(subject =>
        `<button type="button" data-library-subject="${esc(subject)}">${esc(subject)}</button>`
      ).join("")}
    </div>
    <div id="llLibraryTopics" class="ll-page-grid"></div>
    <div class="ll-card">
      <h3>Community resources</h3>
      <p>Explore documents, photos, videos, and learning tips shared by members.</p>
      <button type="button" class="primary" data-page-action="feed">Open learning feed</button>
    </div>
  `;
}

async function searchLibraryBooks(query) {
  const status = $("llBookStatus");
  const results = $("llBookResults");
  if (!status || !results) return;

  results.replaceChildren();

  if (!query.trim()) {
    status.textContent = "Enter a book, author, or subject.";
    return;
  }

  status.textContent = "Searching books…";

  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("limit", "12");
    url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i");

    const response = await fetch(url);
    if (!response.ok) throw new Error("Book search failed.");

    const data = await response.json();
    const books = data.docs || [];

    status.textContent = books.length
      ? `Found ${Number(data.numFound || books.length).toLocaleString()} records.`
      : "No books found. Try another search.";

    books.forEach(book => {
      const card = document.createElement("article");
      card.className = "ll-card";

      if (book.cover_i) {
        const img = document.createElement("img");
        img.src = `https://covers.openlibrary.org/b/id/${encodeURIComponent(book.cover_i)}-M.jpg`;
        img.alt = `Cover of ${book.title || "book"}`;
        img.loading = "lazy";
        img.style.cssText = "max-width:100%;max-height:150px;object-fit:contain";
        card.appendChild(img);
      }

      const title = document.createElement("h3");
      title.textContent = book.title || "Untitled book";

      const author = document.createElement("p");
      author.textContent = (book.author_name || ["Author not listed"]).slice(0, 3).join(", ");

      card.append(title, author);

      if (book.first_publish_year) {
        const year = document.createElement("p");
        year.textContent = `First published: ${book.first_publish_year}`;
        card.appendChild(year);
      }

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
    status.textContent = error.message;
  }
}

function renderHostPage() {
  const content = pageContent();
  if (!content) return;

  if (!session || !isPlatformOwner) {
    showEmpty("Restricted area", "Only the verified platform owner can access host settings.");
    return;
  }

  content.innerHTML = `
    <article class="ll-card">
      <h3>Private host settings</h3>
      <p>Manage the existing revenue settings using the configured host dashboard.</p>
      <button type="button" class="primary" data-page-action="host-settings">Open host settings</button>
    </article>
    <article class="ll-card">
      <h3>Platform status</h3>
      <p>Use the existing Supabase and Vercel dashboards to review backend and deployment status.</p>
      <a href="https://vercel.com/" target="_blank" rel="noopener noreferrer">Open Vercel ↗</a>
    </article>
  `;
}

/* =========================================================
   POST CREATION AND ACTIONS
   ========================================================= */

async function publishPost(event) {
  event.preventDefault();
  if (!requireSession()) return;

  const body = $("llPostText")?.value.trim() || "";
  const postType = $("llPostType")?.value || "Discussion";
  const subject = $("llPostSubject")?.value.trim() || null;
  const file = $("llPostFile")?.files?.[0] || null;
  const button = event.target.querySelector('[type="submit"]');

  if (!body && !file) {
    notify("Write a post or choose a file.");
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

  setBusy(button, true, "Publishing…");

  let uploadedPath = null;

  try {
    if (file) {
      uploadedPath =
        `${session.user.id}/${crypto.randomUUID()}-${file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100)}`;

      const { error } = await supabase.storage
        .from("learning-files")
        .upload(uploadedPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });

      if (error) throw error;
    }

    const { error } = await supabase.from("posts").insert({
      user_id: session.user.id,
      body,
      post_type: postType,
      subject,
      file_path: uploadedPath,
      file_name: file?.name || null,
      file_mime: file?.type || null,
      status: "published"
    });

    if (error) {
      if (uploadedPath) {
        await supabase.storage.from("learning-files").remove([uploadedPath]);
      }
      throw error;
    }

    await loadPosts();
    notify("Your learning post was published.");
  } catch (error) {
    notify("Could not publish post: " + error.message);
  } finally {
    setBusy(button, false);
  }
}

async function toggleLike(postId) {
  if (!requireSession()) return;

  const post = posts.find(p => String(p.id) === String(postId));
  if (!post) return;

  const liked = (post.my_reaction || []).length > 0;

  try {
    if (liked) {
      const { error } = await supabase.from("reactions")
        .delete().eq("post_id", postId).eq("user_id", session.user.id);
      if (error) throw error;

      post.my_reaction = [];
      post.like_count = Math.max(0, (post.like_count || 0) - 1);
    } else {
      const { error } = await supabase.from("reactions").insert({
        post_id: postId,
        user_id: session.user.id
      });
      if (error) throw error;

      post.my_reaction = [true];
      post.like_count = (post.like_count || 0) + 1;
    }

    rerenderCurrentPosts();
  } catch (error) {
    notify("Could not update like: " + error.message);
  }
}

async function openComments(postId) {
  const section = $(`comments-${postId}`);
  if (!section) return;

  section.classList.toggle("show");
  if (!section.classList.contains("show")) return;

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
      ? data.map(c => `<div class="comment">
          <strong>${esc(c.profiles?.display_name || "Member")}</strong>
          <p>${esc(c.body || "").replace(/\n/g, "<br>")}</p>
          <small>${esc(timeAgo(c.created_at))}</small>
        </div>`).join("")
      : "<p>No comments yet. Start the discussion.</p>";
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

  try {
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: session.user.id,
      body,
      status: "published"
    });

    if (error) throw error;

    form.reset();
    await loadPosts();
    const section = $(`comments-${postId}`);
    section?.classList.add("show");
    await openComments(postId);
  } catch (error) {
    notify("Could not send comment: " + error.message);
  }
}

async function sharePost(postId) {
  const url = new URL(window.location.href);
  url.hash = `post-${postId}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: "LearnLoop learning resource", url: url.href });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.href);
      notify("Post link copied.");
    } else {
      window.prompt("Copy this post link:", url.href);
    }
  } catch (error) {
    if (error.name !== "AbortError") notify("Could not share this post.");
  }
}

async function repost(postId) {
  if (!requireSession()) return;

  const original = posts.find(p => String(p.id) === String(postId));
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
    const { error } = await supabase.from("posts").insert({
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
    notify("Resource reposted.");
    await loadPosts();
  } catch (error) {
    notify("Could not repost: " + error.message);
  }
}

async function reportPost(postId) {
  if (!requireSession()) return;

  const reason = window.prompt("Why are you reporting this post?");
  if (reason === null) return;

  if (!reason.trim()) {
    notify("Enter a report reason.");
    return;
  }

  notify("Report recorded for follow-up: post " + postId + ". A report database table is not configured by this code.");
}

async function deletePost(postId) {
  if (!requireSession()) return;

  const post = posts.find(p => String(p.id) === String(postId));
  if (!post || post.user_id !== session.user.id) {
    notify("You can only delete your own posts.");
    return;
  }

  if (!window.confirm("Delete this post? This cannot be undone.")) return;

  try {
    const { error } = await supabase.from("posts")
      .delete().eq("id", postId).eq("user_id", session.user.id);

    if (error) throw error;
    notify("Post deleted.");
    await loadPosts();
  } catch (error) {
    notify("Could not delete post: " + error.message);
  }
}

function rerenderCurrentPosts() {
  if (activeView === "feed") renderHomePage();
  else if (activeView === "following") renderFollowingPage();
  else if (activeView === "discussions") renderDiscussionPage();
  else if (activeView === "community") renderCommunityPage();
  else if (activeView === "uploads") renderUploadsPage();
  else if (activeView === "dashboard") renderDashboardPage();
}

/* =========================================================
   CENTRAL EVENT HANDLING
   ========================================================= */

document.addEventListener("click", async event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    navigate(viewButton.dataset.view);
    return;
  }

  const pageAction = event.target.closest("[data-page-action]");
  if (pageAction) {
    event.preventDefault();

    const action = pageAction.dataset.pageAction;

    if (action === "feed") navigate("feed");
    else if (action === "library") navigate("library");
    else if (action === "uploads") navigate("uploads");
    else if (action === "profile") navigate("profile");
    else if (action === "login") showAuth("login");
    else if (action === "edit-profile") openProfile();
    else if (action === "host-settings") await loadHostSettings();
    else if (action === "cancel-post") {
      $("llHomeComposer")?.classList.add("hidden");
    } else if (action === "new-post") {
      if (!requireSession()) return;
      const composer = $("llHomeComposer");
      composer?.classList.remove("hidden");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      $("llPostText")?.focus();
    }

    return;
  }

  const subjectButton = event.target.closest("[data-library-subject]");
  if (subjectButton) {
    const subject = subjectButton.dataset.librarySubject;
    const target = $("llLibraryTopics");
    if (!target) return;

    const topics = LIBRARY[subject] || {};

    target.innerHTML = `
      <article class="ll-card">
        <button type="button" class="ll-back" data-page-action="library">← All subjects</button>
        <h2>${esc(subject)}</h2>
      </article>
      ${Object.entries(topics).map(([topic, lessons]) => `
        <article class="ll-card">
          <h3>${esc(topic)}</h3>
          <ol>${lessons.map(lesson => `<li>${esc(lesson)}</li>`).join("")}</ol>
          <p class="ll-muted">Lesson outline. Full notes can be added separately.</p>
        </article>
      `).join("")}
    `;

    return;
  }

  const postAction = event.target.closest("[data-action]");
  if (postAction) {
    const id = postAction.dataset.id;
    const action = postAction.dataset.action;

    if (action === "like") await toggleLike(id);
    else if (action === "comment") await openComments(id);
    else if (action === "share") await sharePost(id);
    else if (action === "repost") await repost(id);
    else if (action === "report") await reportPost(id);
    else if (action === "delete") await deletePost(id);
  }
});

document.addEventListener("submit", async event => {
  if (event.target.id === "llPostForm") {
    await publishPost(event);
    return;
  }

  if (event.target.id === "llBookSearch") {
    event.preventDefault();
    await searchLibraryBooks($("llBookQuery")?.value || "");
    return;
  }

  const commentForm = event.target.closest(".comment-form");
  if (commentForm) {
    await submitComment(event, commentForm);
  }
});

$("loginTab")?.addEventListener("click", () => {
  authMode = "login";
  updateAuthMode();
});

$("signupTab")?.addEventListener("click", () => {
  authMode = "signup";
  updateAuthMode();
});

$("authForm")?.addEventListener("submit", authSubmit);
$("profileForm")?.addEventListener("submit", saveProfile);
$("revenueSettingsForm")?.addEventListener("submit", saveRevenueSettings);

$("hostDashboardButton")?.addEventListener("click", () => navigate("host"));

$("newPostTop")?.addEventListener("click", () => {
  if (!requireSession()) return;
  navigate("feed");
  setTimeout(() => {
    $("llHomeComposer")?.classList.remove("hidden");
    $("llPostText")?.focus();
  }, 0);
});

$("heroCreate")?.addEventListener("click", () => {
  if (!requireSession()) return;
  navigate("feed");
  setTimeout(() => {
    $("llHomeComposer")?.classList.remove("hidden");
    $("llPostText")?.focus();
  }, 0);
});

$("profileButton")?.addEventListener("click", () => {
  if (!session) showAuth("login");
  else navigate("profile");
});

$("accountButton")?.addEventListener("click", () => {
  if (!session) showAuth("login");
  else navigate("profile");
});

$("signOut")?.addEventListener("click", signOut);

$("searchInput")?.addEventListener("input", () => {
  if (activeView === "feed") renderHomePage();
  if (activeView === "community") renderCommunityPage();
});

$("sortSelect")?.addEventListener("change", () => {
  if (activeView === "feed") renderHomePage();
  if (activeView === "community") renderCommunityPage();
});

document.querySelectorAll("[data-subject]").forEach(button => {
  button.addEventListener("click", () => {
    activeSubject = button.dataset.subject;
    navigate("feed");
    loadPosts();
  });
});

window.addEventListener("popstate", event => {
  const view = event.state?.learnLoopView;
  if (view && VIEW_INFO[view]) {
    navigate(view, { replaceHistory: true, scroll: false });
  }
});

/* =========================================================
   AUTH STATE AND STARTUP
   ========================================================= */

if (supabase) {
  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;

    setTimeout(async () => {
      await refreshSession();
      if (activeView === "profile") renderProfilePage();
    }, 0);
  });
}

updateAuthMode();
updateAccountUI();

ensurePageStyles();
navigate("feed", { replaceHistory: true });

if (supabase) {
  refreshSession();
} else {
  showEmpty(
    "Connect LearnLoop",
    "The existing Supabase connection could not be loaded. Check src/config.js."
  );
}
