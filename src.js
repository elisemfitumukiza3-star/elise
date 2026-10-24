
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./src/config.js";

/* =========================================================
   LEARNLOOP — Main application
   Uses the existing Supabase project and database.
   ========================================================= */

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const OWNER_EMAIL = "elisemfitumukiza3@gmail.com";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const STORAGE_BUCKET = "learning-files";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const state = {
  session: null,
  profile: null,
  posts: [],
  currentView: "feed",
  authMode: "login",
  loadingPosts: false,
  selectedSubject: "All subjects",
  searchTerm: "",
  commentsByPost: {},
  commentsOpen: new Set(),
  savedIds: new Set(),
  likedIds: new Set(),
  myProfile: null,
  hostSettings: null,
  toastTimer: null
};

const VIEW_INFO = {
  feed: ["Home feed", "Discover what the community is learning."],
  library: ["Learning library", "Explore subjects, books, and learning resources."],
  youtube: ["YouTube Learning", "Search for educational videos and watch them on LearnLoop."],
  discussions: ["Discussions", "Ask questions and share ideas."],
  community: ["Community", "Learn together and help other learners."],
  following: ["Following", "Posts from people you follow."],
  saved: ["Saved resources", "Your bookmarked learning resources."],
  myuploads: ["My uploads", "Content you have shared with the community."],
  notifications: ["Notifications", "Updates and activity from LearnLoop."],
  dashboard: ["My dashboard", "An overview of your learning activity."]
};

/* ---------- Safe HTML and small utilities ---------- */

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function initials(value = "Learner") {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("") || "L";
}

function displayName(profile, email = "") {
  return profile?.display_name?.trim() ||
    email.split("@")[0] ||
    "Learner";
}

function isOwner() {
  return state.session?.user?.email?.toLowerCase() === OWNER_EMAIL;
}

function currentUserId() {
  return state.session?.user?.id || null;
}

function relativeTime(dateValue) {
  if (!dateValue) return "Recently";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently";

  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

function toast(message, type = "success") {
  let element = $("#learnloopToast");

  if (!element) {
    element = document.createElement("div");
    element.id = "learnloopToast";
    element.className = "toast";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    document.body.append(element);
  }

  element.textContent = message;
  element.classList.toggle("error", type === "error");
  element.classList.remove("hidden");

  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    element.classList.add("hidden");
  }, 4000);
}

function setStatus(message = "", type = "success") {
  const banner = $("#statusBanner");
  if (!banner) return;

  banner.textContent = message;
  banner.classList.toggle("hidden", !message);
  banner.classList.toggle("error", type === "error");
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

function safeFileName(name) {
  return String(name || "file")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[_\.]+/, "")
    .slice(-120) || "file";
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime = "") {
  return mime.startsWith("image/");
}

function isVideo(mime = "") {
  return mime.startsWith("video/");
}

function fileIcon(mime = "") {
  if (isImage(mime)) return "🖼️";
  if (isVideo(mime)) return "🎬";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("word")) return "📝";
  if (mime.includes("presentation")) return "📊";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "📈";
  return "📄";
}

function safeUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    if (["https:", "http:"].includes(url.protocol)) return url.href;
  } catch {
    // Ignore invalid URLs.
  }
  return null;
}

function linkifyText(value = "") {
  const escaped = escapeHTML(value);

  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    function (raw) {
      const clean = safeUrl(raw);

      if (!clean) {
        return raw;
      }

      return (
        '<a href="' +
        escapeHTML(clean) +
        '" target="_blank" rel="noopener noreferrer">' +
        raw +
        "</a>"
      );
    }
  );
}

function requireLogin() {
  if (state.session) return true;
  openDialog("authDialog");
  toast("Please log in to use this feature.", "error");
  return false;
}



function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

/* ---------- Local saved resources ---------- */

function loadSavedIds() {
  try {
    const ids = JSON.parse(
      localStorage.getItem("learnloop_saved_posts") || "[]"
    );
    state.savedIds = new Set(ids);
  } catch {
    state.savedIds = new Set();
  }
}

function persistSavedIds() {
  try {
    localStorage.setItem(
      "learnloop_saved_posts",
      JSON.stringify([...state.savedIds])
    );
  } catch {
    toast("Your browser could not save this list.", "error");
  }
}

function loadLikedIds() {
  try {
    state.likedIds = new Set(
      JSON.parse(localStorage.getItem("learnloop_liked_posts") || "[]")
    );
  } catch {
    state.likedIds = new Set();
  }
}

function persistLikedIds() {
  try {
    localStorage.setItem(
      "learnloop_liked_posts",
      JSON.stringify([...state.likedIds])
    );
  } catch {
    // The server remains the source of shared post data.
  }
}

/* ---------- Authentication and profiles ---------- */

async function fetchProfile() {
  if (!currentUserId()) {
    state.profile = null;
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", currentUserId())
    .maybeSingle();

  if (error) {
    console.error("Profile load error:", error);
    state.profile = null;
    return;
  }

  state.profile = data;

  if (!data) {
    const email = state.session?.user?.email || "";
    const metadataName =
      state.session?.user?.user_metadata?.display_name ||
      state.session?.user?.user_metadata?.full_name ||
      email.split("@")[0] ||
      "Learner";

    const result = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: currentUserId(),
          display_name: metadataName,
          bio: ""
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .maybeSingle();

    if (!result.error && result.data) {
      state.profile = result.data;
    } else if (result.error) {
      console.warn("Profile initialization:", result.error.message);
    }
  }
}

async function saveProfile(event) {
  event.preventDefault();
  if (!requireLogin()) return;

  const name = $("#profileDisplayName")?.value.trim();
  const bio = $("#profileBio")?.value.trim();

  if (!name) {
    toast("Please enter your display name.", "error");
    return;
  }

  const button = $("#profileForm button[type='submit']");
  setButtonBusy(button, true, "Saving…");

  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: currentUserId(),
          display_name: name,
          bio: bio || ""
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    state.profile = data;
    closeDialog($("#profileDialog"));
    updateAccountUI();
    toast("Your profile has been updated.");
    await loadPosts();
  } catch (error) {
    console.error(error);
    toast(`Could not save profile: ${error.message}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

function updateAccountUI() {
  const user = state.session?.user;
  const name = displayName(state.profile, user?.email || "");
  const bio = state.profile?.bio || "Share what you are learning.";

  const nameIds = ["sidebarName", "profileCardName"];
  for (const id of nameIds) {
    const el = document.getElementById(id);
    if (el) el.textContent = name;
  }

  const emailEl = $("#sidebarEmail");
  if (emailEl) emailEl.textContent = user?.email || "Not signed in";

  const bioEl = $("#profileCardBio");
  if (bioEl) bioEl.textContent = bio;

  for (const id of ["sidebarAvatar", "composerAvatar", "profileCardAvatar"]) {
    const el = document.getElementById(id);
    if (el && !el.querySelector("img")) el.textContent = initials(name);
  }

  const accountButton = $("#accountButton");
  if (accountButton) {
    accountButton.textContent = user ? "My account" : "Log in";
  }

  const hostButton = $("#hostDashboardButton");
  if (hostButton) hostButton.classList.toggle("hidden", !isOwner());

  const profileButton = $("#profileButton");
  if (profileButton) profileButton.textContent = user ? "Edit profile" : "Sign in";

  const form = $("#postForm");
  if (form) {
    const disabled = !user;
    for (const element of $$("textarea, select, input, button", form)) {
      if (element.type === "file") continue;
      element.disabled = disabled;
    }
  }

  renderHostSettings();
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";

  const signup = state.authMode === "signup";
  if ($("#authTitle")) {
    $("#authTitle").textContent = signup ? "Create your account" : "Welcome back";
  }

  if ($("#authSubmit")) {
    $("#authSubmit").textContent = signup ? "Create account" : "Log in";
  }

  if ($("#authNameWrap")) {
    $("#authNameWrap").classList.toggle("hidden", !signup);
  }

  if ($("#toggleAuthMode")) {
    $("#toggleAuthMode").textContent = signup
      ? "Already have an account? Log in"
      : "New to LearnLoop? Create an account";
  }

  if ($("#authMessage")) $("#authMessage").textContent = "";
}

async function handleAuth(event) {
  event.preventDefault();

  const email = $("#authEmail")?.value.trim();
  const password = $("#authPassword")?.value;
  const name = $("#authName")?.value.trim();

  if (!email || !password) {
    toast("Enter your email and password.", "error");
    return;
  }

  const button = $("#authSubmit");
  setButtonBusy(button, true, "Please wait…");

  try {
    if (state.authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name || email.split("@")[0] }
        }
      });

      if (error) throw error;

      if (data.session) {
        state.session = data.session;
        await fetchProfile();
        closeDialog($("#authDialog"));
        await afterLogin();
        toast("Welcome to LearnLoop!");
      } else {
        if ($("#authMessage")) {
          $("#authMessage").textContent =
            "Account created. Check your email for a verification link, then log in.";
        }
        toast("Check your email to verify your account.");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      state.session = data.session;
      await fetchProfile();
      closeDialog($("#authDialog"));
      await afterLogin();
      toast("You are now logged in.");
    }
  } catch (error) {
    console.error("Authentication error:", error);
    if ($("#authMessage")) $("#authMessage").textContent = error.message;
    toast(error.message || "Authentication failed.", "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    toast(error.message, "error");
    return;
  }

  state.session = null;
  state.profile = null;
  state.posts = [];
  state.commentsByPost = {};
  updateAccountUI();
  await loadPosts();
  closeDialog($("#profileDialog"));
  closeDialog($("#hostDashboardDialog"));
  toast("You have logged out.");
}

async function afterLogin() {
  await fetchProfile();
  updateAccountUI();
  await loadPosts();
  await updateDashboard();
}

supabase.auth.onAuthStateChange((event, session) => {
  state.session = session;

  // Defer Supabase requests until the auth callback finishes.
  setTimeout(async () => {
    if (session) {
      await fetchProfile();
    } else {
      state.profile = null;
    }

    updateAccountUI();
    await loadPosts();
    await updateDashboard();
  }, 0);
});

/* ---------- Navigation ---------- */

function navigate(view) {
  const allowed = Object.keys(VIEW_INFO);
  if (!allowed.includes(view)) return;

  if (["following", "saved", "myuploads", "notifications", "dashboard"].includes(view)
      && !state.session) {
    openDialog("authDialog");
    return;
  }

  state.currentView = view;

  $$("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
    button.setAttribute(
      "aria-current",
      button.dataset.view === view ? "page" : "false"
    );
  });

  const info = VIEW_INFO[view];
  if ($("#topbarTitle")) $("#topbarTitle").textContent = info[0];
  if ($("#topbarSubtitle")) $("#topbarSubtitle").textContent = info[1];

  const pageIds = {
    feed: "feedView",
    library: "libraryView",
    youtube: "youtubeCatalog", 
    discussions: "discussionsView",
    community: "communityView",
    following: "followingView",
    saved: "savedView",
    myuploads: "myuploadsView",
    notifications: "notificationsView",
    dashboard: "dashboardView"
  };

  for (const [key, id] of Object.entries(pageIds)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", key !== view);
  }

  closeMobileMenu();
  renderAllFeeds();

  if (view === "dashboard") updateDashboard();
  if (view === "library") searchBooks();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMobileMenu() {
  $("#sidebar")?.classList.add("open");
}

function closeMobileMenu() {
  $("#sidebar")?.classList.remove("open");
}

/* ---------- Post loading and publishing ---------- */



async function loadPosts() {
  if (state.loadingPosts) return;
  state.loadingPosts = true;

  try {
    const { data, error } = await supabase
      .from("posts")
      .select("*, profiles:user_id(display_name,bio)")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    state.posts = data || [];
    renderAllFeeds();
    await updateDashboard();
  } catch (error) {
    console.error("Post loading error:", error);

    const feed = $("#feed");
    if (feed) {
      feed.innerHTML =
        '<div class="empty-state">' +
        "<h3>We couldn't load the feed</h3>" +
        "<p>" + escapeHTML(error.message || "Please try again.") + "</p>" +
        "</div>";
    }
  } finally {
    state.loadingPosts = false;
  }
}


function validFile(file) {
  if (!file) return true;

  if (file.size > MAX_FILE_BYTES) {
    toast("Files must be 50 MB or smaller.", "error");
    return false;
  }

  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv"
  ];

  const accepted = isImage(file.type) ||
    isVideo(file.type) ||
    allowed.includes(file.type);

  if (!accepted) {
    toast("That file type is not supported.", "error");
    return false;
  }

  return true;
}

async function uploadFile(file) {
  if (!file) return { path: null, name: null, mime: null };

  if (!validFile(file)) throw new Error("Please choose a supported file.");

  const path = `${currentUserId()}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (error) throw error;

  return {
    path,
    name: file.name,
    mime: file.type || "application/octet-stream"
  };
}

async function publishPost(event) {
  event.preventDefault();
  if (!requireLogin()) return;

  const body = $("#postText")?.value.trim() || "";
  const type = $("#postType")?.value || "Discussion";
  const subject = $("#postSubject")?.value || "General";
  const file = $("#postFile")?.files?.[0] || null;

  if (!body && !file) {
    toast("Write something or attach a file before publishing.", "error");
    return;
  }

  if (file && !validFile(file)) return;

  const button = $("#publishButton");
  setButtonBusy(button, true, "Publishing…");

  try {
    const uploaded = await uploadFile(file);

    const { error } = await supabase.from("posts").insert({
      user_id: currentUserId(),
      body,
      post_type: type,
      subject,
      file_path: uploaded.path,
      file_name: uploaded.name,
      file_mime: uploaded.mime,
      status: "published"
    });

    if (error) {
      if (uploaded.path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([uploaded.path]);
      }
      throw error;
    }

    $("#postText").value = "";
    $("#postFile").value = "";
    if ($("#selectedFileName")) $("#selectedFileName").textContent = "";

    await loadPosts();
    navigate("feed");
    toast("Your post has been published!");
  } catch (error) {
    console.error("Publish error:", error);
    toast(`Could not publish: ${error.message}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

/* ---------- File access ---------- */

async function getFileUrl(path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    console.warn("File URL error:", error.message);
    return null;
  }

  return data?.signedUrl || null;
}

/* ---------- Rendering posts ---------- */

function postMatchesSearch(post) {
  if (!state.searchTerm) return true;

  const query = state.searchTerm.toLowerCase();
  const author = post.profiles?.display_name || "";

  return [
    post.body,
    post.subject,
    post.post_type,
    post.file_name,
    author
  ].some(value => String(value || "").toLowerCase().includes(query));
}

function postCard(post) {
  const userId = currentUserId();
  const ownPost = !!userId && post.user_id === userId;
  const liked = state.likedIds.has(post.id);
  const saved = state.savedIds.has(post.id);
  const commentCount = post.comment_count || 0;
  const name = post.profiles?.display_name || "LearnLoop learner";
  const bio = post.profiles?.bio || "";
  const body = post.body || "";
  const subject = post.subject || "General";
  const type = post.post_type || "Discussion";

  return `
    <article class="post-card" data-post-id="${escapeHTML(post.id)}">
      <div class="post-header">
        <div class="mini-avatar">${escapeHTML(initials(name))}</div>
        <div class="post-author">
          <strong>${escapeHTML(name)}</strong>
          <small>${escapeHTML(relativeTime(post.created_at))}${bio ? ` · ${escapeHTML(bio.slice(0, 65))}` : ""}</small>
        </div>
        <span class="post-badge">${escapeHTML(type)}</span>
      </div>

      <div class="post-meta small muted" style="margin-top:10px">
        ${escapeHTML(subject)}
      </div>

      ${body ? `<div class="post-body">${linkifyText(body)}</div>` : ""}

      ${post.file_path ? `
        <div class="post-attachment" data-file-path="${escapeHTML(post.file_path)}">
          <div class="post-attachment-icon">${fileIcon(post.file_mime || "")}</div>
          <div class="post-attachment-info">
            <strong>${escapeHTML(post.file_name || "Learning resource")}</strong>
            <small>Attached learning resource</small>
          </div>
          <button class="button button-secondary" data-action="open-file" type="button">
            Open
          </button>
        </div>` : ""}

      <div class="post-actions">
        <button type="button" class="post-action ${liked ? "active" : ""}"
          data-action="like" aria-pressed="${liked}">
          ${liked ? "♥ Liked" : "♡ Like"}
        </button>
        <button type="button" class="post-action"
          data-action="comments">💬 Comment</button>
        <button type="button" class="post-action ${saved ? "active" : ""}"
          data-action="save" aria-pressed="${saved}">
          ${saved ? "★ Saved" : "☆ Save"}
        </button>
        <button type="button" class="post-action"
          data-action="share">↗ Share</button>
        ${ownPost ? "" : `<button type="button" class="post-action" data-action="report">⚑ Report</button>`}
      </div>

      <div class="post-comments ${state.commentsOpen.has(post.id) ? "" : "hidden"}"
        data-comments-for="${escapeHTML(post.id)}">
        <div class="comments-list">
          ${state.commentsByPost[post.id] === undefined
            ? `<p class="muted small">Open comments to load replies.</p>`
            : renderComments(state.commentsByPost[post.id])}
        </div>

        ${userId ? `
          <form class="comment-form" data-comment-form="${escapeHTML(post.id)}">
            <input name="comment" type="text" maxlength="2000"
              placeholder="Write a helpful comment…" required>
            <button class="button button-primary" type="submit">Send</button>
          </form>` : `<p class="muted small">Log in to comment.</p>`}
      </div>
    </article>`;
}

function renderComments(comments) {
  if (!comments?.length) {
    return `<p class="muted small">No comments yet. Start a helpful conversation.</p>`;
  }

  return comments.map(comment => `
    <div class="comment-item">
      <strong>${escapeHTML(comment.profiles?.display_name || "Learner")}</strong>
      <span class="muted small">${escapeHTML(relativeTime(comment.created_at))}</span>
      <p>${escapeHTML(comment.body || "")}</p>
    </div>`).join("");
}

function renderEmpty(title, message) {
  return `
    <div class="empty-state">
      <div class="empty-icon">📚</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
    </div>`;
}

function filteredPosts(mode = "all") {
  let posts = [...state.posts];

  if (state.selectedSubject !== "All subjects" &&
      mode !== "saved" && mode !== "mine") {
    posts = posts.filter(post => post.subject === state.selectedSubject);
  }

  if (mode === "discussions") {
    posts = posts.filter(post =>
      ["Discussion", "Question", "Learning tip", "Story"].includes(post.post_type)
    );
  }

  if (mode === "saved") {
    posts = posts.filter(post => state.savedIds.has(post.id));
  }

  if (mode === "mine") {
    posts = posts.filter(post => post.user_id === currentUserId());
  }

  if (mode === "following") {
    // No follow-relationship table is assumed to exist yet.
    posts = [];
  }

  posts = posts.filter(postMatchesSearch);

  const sort = $("#sortSelect")?.value || "latest";
  if (sort === "popular") {
    posts.sort((a, b) => (b.reaction_count || 0) - (a.reaction_count || 0));
  }

  return posts;
}

function renderPostList(element, posts, emptyTitle, emptyMessage) {
  if (!element) return;

  if (!posts.length) {
    element.innerHTML = renderEmpty(emptyTitle, emptyMessage);
    return;
  }

  element.innerHTML = posts.map(postCard).join("");
}

function renderAllFeeds() {
  const feedPosts = filteredPosts("all");
  renderPostList($("#feed"), feedPosts, "No posts yet", "Be the first to share a useful learning resource.");

  renderPostList(
    $("#discussionsFeed"),
    filteredPosts("discussions"),
    "No discussions yet",
    "Questions, stories, and learning tips will appear here."
  );

  renderPostList(
    $("#communityFeed"),
    filteredPosts("all"),
    "Your community is getting started",
    "Published learning posts will appear here."
  );

  renderPostList(
    $("#followingFeed"),
    filteredPosts("following"),
    "Following is not connected yet",
    "A follow system needs a follow-relationships table and its access policies before this view can show posts."
  );

  renderPostList(
    $("#savedList"),
    filteredPosts("saved"),
    "No saved resources yet",
    "Choose Save on a post to keep it in this browser."
  );

  renderPostList(
    $("#myUploadsList"),
    filteredPosts("mine"),
    "You haven't shared anything yet",
    "Your published posts and resources will appear here."
  );
}

/* ---------- Likes and comments ---------- */

async function toggleLike(post) {
  if (!requireLogin()) return;

  const wasLiked = state.likedIds.has(post.id);

  if (wasLiked) {
    state.likedIds.delete(post.id);
  } else {
    state.likedIds.add(post.id);
  }

  persistLikedIds();
  renderAllFeeds();

  try {
    if (wasLiked) {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", currentUserId());

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("reactions")
        .upsert(
          { post_id: post.id, user_id: currentUserId() },
          { onConflict: "post_id,user_id" }
        );

      if (error) throw error;
    }
  } catch (error) {
    console.warn("Reaction update error:", error);
    toast("The reaction could not be saved. Check your database policies.", "error");
    await loadPosts();
  }
}

async function loadComments(postId) {
  const { data, error } = await supabase
    .from("comments")
    .select("*, profiles:user_id(display_name,bio)")
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Comment load error:", error);
    toast("Comments could not be loaded.", "error");
    return;
  }

  state.commentsByPost[postId] = data || [];
  renderAllFeeds();
}

async function submitComment(event, postId) {
  event.preventDefault();
  if (!requireLogin()) return;

  const form = event.target;
  const input = $('input[name="comment"]', form);
  const body = input?.value.trim();

  if (!body) return;

  const button = $("button[type='submit']", form);
  setButtonBusy(button, true, "Sending…");

  try {
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      user_id: currentUserId(),
      body,
      status: "published"
    });

    if (error) throw error;

    state.commentsOpen.add(postId);
    await loadComments(postId);
    toast("Comment added.");
    await updateDashboard();
  } catch (error) {
    console.error("Comment submit error:", error);
    toast(`Could not add comment: ${error.message}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

/* ---------- Post actions ---------- */

async function reportPost(post) {
  if (!requireLogin()) return;

  const reason = window.prompt(
    "Why are you reporting this post? Please give a short explanation."
  );

  if (!reason?.trim()) return;

  // The reports table must be created with suitable RLS policies
  // before reports can be stored safely.
  const { error } = await supabase.from("reports").insert({
    post_id: post.id,
    reporter_id: currentUserId(),
    reason: reason.trim(),
    status: "pending"
  });

  if (error) {
    console.error("Report submission error:", error);
    toast(
      "Reporting is not configured yet. The reports table and its security policies must be added first.",
      "error"
    );
    return;
  }

  toast("Thank you. Your report has been submitted.");
}

async function handlePostAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest("[data-post-id]");
  if (!card) return;

  const post = state.posts.find(item => String(item.id) === card.dataset.postId);
  if (!post) return;

  const action = button.dataset.action;

  if (action === "like") {
    await toggleLike(post);
  } else if (action === "save") {
    if (!requireLogin()) return;

    if (state.savedIds.has(post.id)) {
      state.savedIds.delete(post.id);
      toast("Removed from saved resources.");
    } else {
      state.savedIds.add(post.id);
      toast("Saved in this browser.");
    }

    persistSavedIds();
    renderAllFeeds();
  } else if (action === "comments") {
    if (state.commentsOpen.has(post.id)) {
      state.commentsOpen.delete(post.id);
      renderAllFeeds();
    } else {
      state.commentsOpen.add(post.id);
      state.commentsByPost[post.id] = undefined;
      renderAllFeeds();
      await loadComments(post.id);
    }
  } else if (action === "share") {
    const url = `${window.location.origin}${window.location.pathname}#post-${encodeURIComponent(post.id)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "LearnLoop learning resource",
          text: post.body || post.file_name || "Discover this learning resource",
          url
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast("Link copied.");
      } else {
        window.prompt("Copy this link:", url);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        toast("Could not share this post.", "error");
      }
    }
  } else if (action === "report") {
    await reportPost(post);
  } else if (action === "open-file") {
    const path = card.querySelector("[data-file-path]")?.dataset.filePath;
    if (!path) return;

    const url = await getFileUrl(path);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast("The file could not be opened. Check its storage access policies.", "error");
    }
  }
}

/* ---------- Learning library: Google Books ---------- */

async function searchBooks() {
  const results = $("#googleBooksResults");
  if (!results) return;

  const input = $("#librarySearch");
  const typedQuery = input?.value.trim() || "";
  const subject = state.selectedSubject || "";

  const query = typedQuery || (
    subject && subject !== "All subjects"
      ? `subject:${subject}`
      : ""
  );

  if (!query) {
    if ($("#googleBooksStatus")) {
      $("#googleBooksStatus").textContent =
        "Search for a book, author, or subject.";
    }

    results.innerHTML = renderEmpty(
      "Discover your next book",
      "Enter a title, author, or subject to search Open Library."
    );
    return;
  }

  if ($("#googleBooksStatus")) {
    $("#googleBooksStatus").textContent =
      "Searching Open Library…";
  }

  results.innerHTML =
    '<p class="muted small">Searching for books…</p>';

  try {
    const endpoint = new URL(
      "https://openlibrary.org/search.json"
    );

    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("limit", "12");
    endpoint.searchParams.set(
      "fields",
      "key,title,author_name,cover_i,first_publish_year,subject,public_scan_b,has_fulltext"
    );

    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error("Open Library search failed.");
    }

    const data = await response.json();
    const books = data.docs || [];

    if ($("#googleBooksStatus")) {
      $("#googleBooksStatus").textContent =
        `${data.numFound || 0} books found in Open Library`;
    }

    if (!books.length) {
      results.innerHTML = renderEmpty(
        "No books found",
        "Try another title, author, or subject."
      );
      return;
    }

    results.innerHTML = books.map(book => {
      const title = book.title || "Untitled book";
      const authors = (book.author_name || []).join(", ") ||
        "Author unavailable";
      const year = book.first_publish_year || "";
      const category = book.subject?.[0] ||
        subject ||
        "Learning resource";

      const cover = book.cover_i
        ? `https://covers.openlibrary.org/b/id/${Number(book.cover_i)}-M.jpg`
        : "";

    
      const bookUrl = book.key &&
        /^\/works\/OL\d+W$/.test(book.key)
          ? `https://openlibrary.org${book.key}`
          : "https://openlibrary.org";


      const onlineReading = Boolean(
        book.public_scan_b || book.has_fulltext
      );

      return `
        <article class="book-card">
          ${cover
            ? `<img src="${cover}"
                alt="${escapeHTML(title)} cover"
                loading="lazy">`
            : `<div class="book-placeholder">📘</div>`}

          <span class="lesson-badge">
            ${escapeHTML(category)}
          </span>

          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(authors)}</p>
          ${year ? `<p>First published: ${year}</p>` : ""}

          <p class="muted small">
            ${onlineReading
              ? "Online reading may be available."
              : "Check the book record for reading options."}
          </p>

          <a class="button button-primary"
             href="${bookUrl}"
             target="_blank"
             rel="noopener noreferrer">
            ${onlineReading
              ? "Check online reading"
              : "View book details"}
          </a>
        </article>`;
    }).join("");

  } catch (error) {
    console.error("Open Library search error:", error);

    if ($("#googleBooksStatus")) {
      $("#googleBooksStatus").textContent =
        "Book search unavailable";
    }

    results.innerHTML = renderEmpty(
      "Book search is temporarily unavailable",
      "Check your internet connection and try again."
    );
  }
}

function openBookPreview(bookId, title) {
  const reader = $("#libraryReader");
  const catalog = $("#libraryCatalog");
  const frame = $("#libraryReaderFrame");
  const readerTitle = $("#libraryReaderTitle");
  const readerMessage = $("#libraryReaderMessage");

  if (!reader || !frame || !bookId) return;

  if (readerTitle) readerTitle.textContent = title || "Book preview";

  if (readerMessage) {
    readerMessage.textContent =
      "Loading the Google Books preview. Availability depends on the publisher and your region.";
  }

  // Google Books' embedded reader uses this iframe.
  const previewUrl = new URL("https://books.google.com/books");
  previewUrl.searchParams.set("id", bookId);
  previewUrl.searchParams.set("output", "embed");

  frame.src = previewUrl.toString();
  reader.classList.remove("hidden");
  catalog?.classList.add("hidden");
  reader.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Dashboard ---------- */

async function updateDashboard() {
  if (!state.session) {
    ["statPosts", "statComments", "statReactions"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0";
    });
    return;
  }

  const userId = currentUserId();

  const [postsResult, commentsResult, reactionsResult] = await Promise.all([
    supabase.from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "published"),

    supabase.from("comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "published"),

    supabase.from("reactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
  ]);

  const values = {
    statPosts: postsResult.count ?? 0,
    statComments: commentsResult.count ?? 0,
    statReactions: reactionsResult.count ?? 0
  };

  for (const [id, value] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }
}

/* ---------- Host controls ---------- */

async function loadHostDashboard() {
  if (!isOwner()) {
    toast("This dashboard is restricted to the platform owner.", "error");
    return;
  }

  openDialog("hostDashboardDialog");

  const [posts, profiles] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("user_id", { count: "exact", head: true })
  ]);

  if ($("#hostPostsCount")) {
    $("#hostPostsCount").textContent = String(posts.count ?? "—");
  }

  if ($("#hostProfilesCount")) {
    $("#hostProfilesCount").textContent = String(profiles.count ?? "—");
  }

  const { data, error } = await supabase
    .from("platform_revenue_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Host settings load error:", error);
    state.hostSettings = null;
    if ($("#revenueNotice")) {
      $("#revenueNotice").textContent =
        "Host settings could not be loaded. Check table access policies.";
    }
  } else {
    state.hostSettings = data;
  }

  renderHostSettings();
  await renderHostModeration();
}

function renderHostSettings() {
  const hostForm = $("#revenueSettingsForm");
  if (!hostForm) return;

  const restricted = !isOwner();
  for (const control of $$("input, select, textarea, button", hostForm)) {
    control.disabled = restricted;
  }

  const adsToggle = $("#limitedAdsEnabled");
  if (adsToggle) {
    adsToggle.checked = !!state.hostSettings?.limited_ads_enabled;
  }
}

async function saveHostSettings(event) {
  event.preventDefault();

  if (!isOwner()) {
    toast("Only the platform owner can change these settings.", "error");
    return;
  }

  const limitedAdsEnabled = !!$("#limitedAdsEnabled")?.checked;

  const button = $("#revenueSettingsForm button[type='submit']");
  setButtonBusy(button, true, "Saving…");

  try {
    const existing = state.hostSettings || {};
    const payload = {
      ...existing,
      limited_ads_enabled: limitedAdsEnabled
    };

    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;

    const { data, error } = await supabase
      .from("platform_revenue_settings")
      .upsert(payload)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    state.hostSettings = data || payload;
    renderHostSettings();
    toast("Host settings saved.");
  } catch (error) {
    console.error("Host settings save error:", error);
    toast(
      `Could not save host settings: ${error.message}. Verify the table schema and owner-only RLS policies.`,
      "error"
    );
  } finally {
    setButtonBusy(button, false);
  }
}

async function renderHostModeration() {
  const container = $("#hostModerationList");
  if (!container) return;

  if (!isOwner()) {
    container.innerHTML = renderEmpty(
      "Restricted",
      "Only the platform owner can access moderation tools."
    );
    return;
  }

  const { data, error } = await supabase
    .from("posts")
    .select("id,body,post_type,user_id,created_at,status")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    container.innerHTML = renderEmpty(
      "Moderation list unavailable",
      "Check the posts table's owner access policies."
    );
    return;
  }

  if (!data?.length) {
    container.innerHTML = renderEmpty(
      "No posts found",
      "Published content will appear here."
    );
    return;
  }

  container.innerHTML = data.map(post => `
    <div class="compact-list-item">
      <div style="flex:1;min-width:0">
        <strong>${escapeHTML(post.post_type || "Post")}</strong>
        <p>${escapeHTML((post.body || "Attachment post").slice(0, 180))}</p>
        <small class="muted">${escapeHTML(relativeTime(post.created_at))}</small>
      </div>
      ${post.status === "published"
        ? `<button class="button button-danger" type="button" data-moderate-post="${escapeHTML(post.id)}">Remove</button>`
        : `<span class="muted small">Not published</span>`}
    </div>`).join("");
}

async function moderatePost(event) {
  if (!isOwner()) {
    toast("Owner access required.", "error");
    return;
  }

  const button = event.target.closest("[data-moderate-post]");
  if (!button) return;

  const postId = button.dataset.moderatePost;
  const confirmed = window.confirm(
    "Remove this post from the published feed? This changes its status and does not delete its stored file."
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("posts")
    .update({ status: "removed" })
    .eq("id", postId);

  if (error) {
    toast(`Could not remove post: ${error.message}`, "error");
    return;
  }

  await loadPosts();
  await renderHostModeration();
  toast("Post removed from the published feed.");
}

/* ---------- Profile dialog ---------- */

function openProfile() {
  if (!requireLogin()) return;

  if ($("#profileDisplayName")) {
    $("#profileDisplayName").value =
      state.profile?.display_name ||
      state.session?.user?.user_metadata?.display_name ||
      "";
  }

  if ($("#profileBio")) {
    $("#profileBio").value = state.profile?.bio || "";
  }

 
  openDialog("profileDialog");
}

/* ---------- YouTube Learning ---------- */

async function searchYouTubeVideos() {
  const input = $("#youtubeSearchInput");
  const results = $("#youtubeResults");
  const status = $("#youtubeStatus");

  if (!input || !results || !status) return;

  const query = input.value.trim();

  if (!query) {
    status.textContent = "Enter a subject or lesson to search.";
    return;
  }

  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (!apiKey) {
    status.textContent =
      "YouTube search is not configured yet. Check your Vercel environment variable.";
    return;
  }

  status.textContent = "Searching for educational videos...";
  results.replaceChildren();

  try {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      safeSearch: "strict",
      maxResults: "12",
      q: query,
      key: apiKey
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message || "YouTube search failed."
      );
    }

    if (!data.items?.length) {
      status.textContent = "No videos found. Try another search.";
      return;
    }

    data.items.forEach(video => {
      const videoId = video.id.videoId;
      const title = video.snippet.title;
      const channel = video.snippet.channelTitle;
      const thumbnail =
        video.snippet.thumbnails?.medium?.url ||
        video.snippet.thumbnails?.default?.url;

      const card = document.createElement("article");
      card.className = "youtube-card";

      const image = document.createElement("img");
      image.src = thumbnail || "";
      image.alt = "";
      image.loading = "lazy";

      const heading = document.createElement("h3");
      heading.textContent = title;

      const channelText = document.createElement("p");
      channelText.textContent = channel;

      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "button button-primary";
      playButton.textContent = "Watch lesson";

      playButton.addEventListener("click", () => {
        const panel = $("#youtubePlayerPanel");
        const player = $("#youtubePlayer");
        const playerTitle = $("#youtubePlayerTitle");

        if (!panel || !player || !playerTitle) return;

        playerTitle.textContent = title;
        player.src =
          `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
        panel.classList.remove("hidden");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      card.append(image, heading, channelText, playButton);
      results.append(card);
    });

    status.textContent = `Found ${data.items.length} videos. Choose a lesson to watch.`;
  } catch (error) {
    console.error("YouTube search error:", error);
    status.textContent =
      `Unable to search YouTube: ${error.message}`;
  }
}

/* ---------- Event wiring ---------- */

function bindEvents() {

  $("#youtubeSearchButton")?.addEventListener("click", () => {
    searchYouTubeVideos();
  });

  document.querySelectorAll("[data-youtube-query]").forEach(button => {
    button.addEventListener("click", () => {
      const input = $("#youtubeSearchInput");
      if (!input) return;

      input.value = button.dataset.youtubeQuery || "";
      searchYouTubeVideos();
    });
  });


  $("#youtubeSearchInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchYouTubeVideos();
    }
  });
  $$("[data-view]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  $("#menuButton")?.addEventListener("click", openMobileMenu);

  $("#sidebar")?.addEventListener("click", event => {
    const clickedNav = event.target.closest("[data-view]");
    if (clickedNav) closeMobileMenu();
  });

  $("#accountButton")?.addEventListener("click", () => {
    if (state.session) openProfile();
    else {
      setAuthMode("login");
      openDialog("authDialog");
    }
  });

  $("#profileButton")?.addEventListener("click", () => {
    if (state.session) openProfile();
    else {
      setAuthMode("login");
      openDialog("authDialog");
    }
  });

  $("#rightProfileButton")?.addEventListener("click", openProfile);
  $("#profileForm")?.addEventListener("submit", saveProfile);
  $("#authForm")?.addEventListener("submit", handleAuth);

  $("#toggleAuthMode")?.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "signup" : "login");
  });

  $("#signOutButton")?.addEventListener("click", signOut);
  $("#postForm")?.addEventListener("submit", publishPost);

  $("#postFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file && !validFile(file)) {
      event.target.value = "";
      if ($("#selectedFileName")) $("#selectedFileName").textContent = "";
      return;
    }

    if ($("#selectedFileName")) {
      $("#selectedFileName").textContent = file
        ? `${file.name} · ${formatBytes(file.size)}`
        : "";
    }
  });

  $("#sortSelect")?.addEventListener("change", renderAllFeeds);
$("#librarySearchButton")?.addEventListener("click", searchBooks);

$("#googleBooksResults")?.addEventListener("click", event => {
  const button = event.target.closest("[data-book-preview]");
  if (!button) return;

  openBookPreview(
    button.dataset.bookPreview,
    button.dataset.bookTitle || "Book preview"
  );
});

$("#libraryBackButton")?.addEventListener("click", () => {
  $("#libraryReader")?.classList.add("hidden");
  $("#libraryCatalog")?.classList.remove("hidden");

  const frame = $("#libraryReaderFrame");
  if (frame) frame.removeAttribute("src");
});
  $("#searchInput")?.addEventListener("input", event => {
    state.searchTerm = event.target.value.trim();
    renderAllFeeds();

    if (state.currentView === "library") {
      if ($("#librarySearch")) $("#librarySearch").value = event.target.value;
    }
  });


  $("#librarySearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchBooks();
    }
  });

  $("#librarySearch")?.addEventListener("input", event => {
    state.searchTerm = event.target.value.trim();
  });

  $("#librarySubjects")?.addEventListener("click", event => {
    const button = event.target.closest("[data-subject]");
    if (!button) return;

    state.selectedSubject = button.dataset.subject;
    $$("#librarySubjects [data-subject]").forEach(subjectButton => {
      subjectButton.classList.toggle("active", subjectButton === button);
    });

    if ($("#postSubject")) {
      const options = [...$("#postSubject").options];
      const match = options.find(option => option.value === state.selectedSubject);
      if (match) $("#postSubject").value = match.value;
    }
if ($("#librarySearch")) $("#librarySearch").value = "";
searchBooks();
    renderAllFeeds();
  });

  document.addEventListener("click", event => {
    const closeButton = event.target.closest("[data-close]");
    if (closeButton) {
      const dialog = document.getElementById(closeButton.dataset.close);
      if (dialog) closeDialog(dialog);
    }
  });

  document.addEventListener("click", event => {
    const card = event.target.closest(".post-card");
    if (card) handlePostAction(event);
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-comment-form]");
    if (form) {
      event.preventDefault();
      submitComment(event, form.dataset.commentForm);
    }
  });

  $("#hostDashboardButton")?.addEventListener("click", loadHostDashboard);
  $("#revenueSettingsForm")?.addEventListener("submit", saveHostSettings);
  $("#hostModerationList")?.addEventListener("click", moderatePost);

  // Close dialogs by clicking their backdrop.
  $$("dialog").forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
}

/* ---------- Start application ---------- */

async function init() {
  loadSavedIds();
  loadLikedIds();
  bindEvents();
  setAuthMode("login");

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Session load error:", error);
    setStatus("We could not restore your session. Please log in again.", "error");
  }

  state.session = data?.session || null;

  if (state.session) {
    await fetchProfile();
  }

  updateAccountUI();
  await loadPosts();
  await updateDashboard();
  navigate("feed");

  // Default library results remain helpful even before a search.
  const books = $("#googleBooksResults");
  if (books && !books.innerHTML.trim()) {
    books.innerHTML = renderEmpty(
      "Find your next learning resource",
      "Search by book title, author, subject, or keyword."
    );
  }
}

init().catch(error => {
  console.error("LearnLoop initialization failed:", error);
  setStatus(
    "LearnLoop could not start correctly. Check the browser console and Supabase settings.",
    "error"
  );
});

