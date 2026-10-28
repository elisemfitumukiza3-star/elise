
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
  followingIds: new Set(),
  myProfile: null,
  hostSettings: null,
  toastTimer: null
};

const VIEW_INFO = {
  feed: ["Home feed", "Discover what the community is learning."],
  library: ["Learning library", "Explore subjects, books, and learning resources."],
  youtube: ["YouTube Learning", "Search for educational videos and watch them on LearnLoop."],
  discussions: ["Discussions", "Ask questions and share ideas."],
   messages: ["Private Messages", "Chat privately with other LearnLoop learners."],
  community: ["Community", "Learn together and help other learners."],
  people: ["People", "Discover learners and follow their journeys."], 
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
    .eq("id", currentUserId())
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
          id: currentUserId(),
          display_name: metadataName,
          bio: ""
        },
        { onConflict: "id" }
      )
      .select("*")
      .maybeSingle();

    if (result.error) {
      console.warn("Profile initialization:", result.error.message);
    } else {
      state.profile = result.data;
    }
  }

  const profile = state.profile;
  if (!profile) return;

  if ($("#profileDisplayName")) {
    $("#profileDisplayName").value = profile.display_name || "";
  }

  if ($("#profileBio")) {
    $("#profileBio").value = profile.bio || "";
  }

  if ($("#profileCountryCode")) {
    $("#profileCountryCode").value = profile.country_calling_code || "";
  }

  if ($("#profilePhone")) {
    $("#profilePhone").value = profile.phone_number || "";
  }

  const preview = $("#profilePicturePreviewImage");
  const placeholder = $("#profilePicturePlaceholder");

  if (preview) {
    preview.classList.add("hidden");
    preview.removeAttribute("src");

    if (profile.avatar_url) {
      preview.src = profile.avatar_url;
      preview.classList.remove("hidden");
    }
  }

  if (placeholder) {
    placeholder.classList.toggle("hidden", Boolean(profile.avatar_url));
  }
}

async function loadPeople() {
  const container = $("#peopleList");
  if (!container) return;

  const userId = currentUserId();

  if (!userId) {
    container.innerHTML = "<p>Please log in to discover learners.</p>";
    return;
  }

  container.innerHTML = "<p>Loading learners...</p>";

  const { data: people, error } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url")
    .neq("id", userId)
    .order("display_name");

  if (error) {
    console.error("People loading error:", error);
    container.innerHTML = "<p>Could not load learners. Please try again.</p>";
    return;
  }

  if (!people?.length) {
    container.innerHTML = "<p>No other learners have joined yet.</p>";
    return;
  }
if (!people?.length) {
  container.innerHTML = "<p>No other learners have joined yet.</p>";
  return;
}
const searchTerm = ($("#peopleSearch")?.value || "").trim().toLowerCase();

const filteredPeople = people.filter(person =>
  (person.display_name || "Learner")
    .toLowerCase()
    .includes(searchTerm)
);

container.innerHTML = filteredPeople.map(person => {
    const following = state.followingIds.has(person.id);
    const name = escapeHTML(person.display_name || "Learner");
    const bio = escapeHTML(person.bio || "LearnLoop community member");
    const avatar = person.avatar_url
      ? `<img src="${escapeHTML(person.avatar_url)}" alt="${name}" class="people-avatar">`
      : `<div class="people-avatar-placeholder">👤</div>`;

    return `
      <article class="people-user-card">
        ${avatar}
        <h3>${name}</h3>
        <p>${bio}</p>
        <button type="button"
          data-follow-user="${person.id}"
          class="${following ? "is-following" : ""}">
          ${following ? "Following" : "Follow"}
        </button>
      </article>`;
  }).join("");
}

document.addEventListener("click", async function (event) {
  const button = event.target.closest("[data-follow-user]");
  if (!button) return;

  const userId = currentUserId();
  const targetId = button.dataset.followUser;

  if (!userId) {
    toast("Please log in to follow learners.", "error");
    return;
  }

  if (!targetId || targetId === userId) return;

  button.disabled = true;

  try {
    if (state.followingIds.has(targetId)) {
      const { error } = await supabase
        .from("user_follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", targetId);

      if (error) throw error;
      state.followingIds.delete(targetId);
    } else {
      const { error } = await supabase
        .from("user_follows")
        .insert({
          follower_id: userId,
          following_id: targetId
        });

      if (error) throw error;
      state.followingIds.add(targetId);
    }

    await loadPeople();
    renderAllFeeds();
    toast(
      state.followingIds.has(targetId)
        ? "You are now following this learner."
        : "You unfollowed this learner.",
      "success"
    );
  } catch (error) {
    console.error("Follow action failed:", error);
    toast("Could not update following. Please try again.", "error");
  } finally {
    button.disabled = false;
  }
   document.querySelector("#peopleSearch")?.addEventListener("input", () => {
  loadPeople();
});
});




async function saveProfile(event) {
 event.preventDefault();
event.stopPropagation();
event.stopPropagation(); 
  if (event.target.id === "postForm") {
  event.target.noValidate = true;
} 
  if (!requireLogin()) return;

  const name = $("#profileDisplayName")?.value.trim();
  const bio = $("#profileBio")?.value.trim() || "";
  const countryCode = $("#profileCountryCode")?.value || "";
  const phone = $("#profilePhone")?.value.trim() || "";
  const picture = $("#profilePicture")?.files?.[0] || null;

  if (!name) {
    toast("Please enter your display name.", "error");
    return;
  }

  if (phone && !countryCode) {
    toast("Please choose your country calling code.", "error");
    return;
  }

  if (countryCode && !phone) {
    toast("Please enter your mobile number or clear the country code.", "error");
    return;
  }

  const button = $("#profileForm button[type='submit']");
  setButtonBusy(button, true, "Saving…");

  try {
    let avatarUrl = state.profile?.avatar_url || null;

    if (picture) {
      if (!picture.type.startsWith("image/")) {
        throw new Error("Please select an image file.");
      }

      if (picture.size > 5 * 1024 * 1024) {
        throw new Error("Profile pictures must be 5 MB or smaller.");
      }

      const extension = picture.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
      const path = `${currentUserId()}/avatar-${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, picture, {
          cacheControl: "3600",
          upsert: false,
          contentType: picture.type
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);

      avatarUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: currentUserId(),
          display_name: name,
          bio,
          avatar_url: avatarUrl,
          country_calling_code: countryCode || null,
          phone_number: phone || null,
          phone_is_public: false,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
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
    console.error("Profile save error:", error);
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


const avatarUrl = state.profile?.avatar_url || "";

for (const id of ["sidebarAvatar", "composerAvatar", "profileCardAvatar"]) {
  const el = document.getElementById(id);
  if (!el) continue;

  let img = el.querySelector("img");

  if (avatarUrl) {
    if (!img) {
      img = document.createElement("img");
      img.alt = `${name}'s profile picture`;
      el.replaceChildren(img);
    }

    img.src = avatarUrl;
    img.alt = `${name}'s profile picture`;
    el.classList.add("has-profile-picture");
  } else {
    if (img) img.remove();
    el.textContent = initials(name);
    el.classList.remove("has-profile-picture");
  }
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

function updateWelcomeAuthMode() {
  const signup = state.authMode === "signup";

  if ($("#welcomeFormTitle")) {
    $("#welcomeFormTitle").textContent =
      signup ? "Create your account" : "Welcome back";
  }

  if ($("#welcomeNameWrap")) {
    $("#welcomeNameWrap").classList.toggle("hidden", !signup);
  }

  if ($("#welcomeName")) {
    $("#welcomeName").classList.toggle("hidden", !signup);
    $("#welcomeName").required = signup;
    $("#welcomeName").autocomplete = "name";
  }

  const password = $("#welcomePassword");
  if (password) {
    password.autocomplete = signup ? "new-password" : "current-password";
  }

  const submit = $("#welcomeAuthForm button[type='submit']");
  if (submit) {
    submit.textContent = signup ? "Create account" : "Sign in";
  }

  if ($("#welcomeSwitchText")) {
    $("#welcomeSwitchText").textContent =
      signup ? "Already have an account?" : "New to LearnLoop?";
  }

  if ($("#welcomeSwitchButton")) {
    $("#welcomeSwitchButton").textContent =
      signup ? "Sign in" : "Create new account";
  }

  if ($("#welcomeAuthMessage")) {
    $("#welcomeAuthMessage").textContent = "";
  }
}


async function handleAuth(event) {
  event.preventDefault();

  const email = $("#authEmail")?.value.trim();
  const password = $("#authPassword")?.value;
  const name = $("#authName")?.value.trim();
  const phoneCountry = $("#authName")?.dataset.phoneCountry || "";
  const phoneNumber = $("#authName")?.dataset.phoneNumber || "";

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
          data: {
            display_name: name || email.split("@")[0],
            country_calling_code: phoneCountry,
            phone_number: phoneNumber
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        state.session = data.session;

        if (phoneCountry && phoneNumber && data.user) {
          const { error: phoneSaveError } = await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,
              country_calling_code: phoneCountry,
              phone_number: phoneNumber,
              phone_is_public: false,
              updated_at: new Date().toISOString()
            }, { onConflict: "id" });

          if (phoneSaveError) {
            console.error("Phone save error:", phoneSaveError);
          }
        }

        await fetchProfile();
        closeDialog($("#authDialog"));
        await afterLogin();
        toast("Welcome to LearnLoop!");
      } else {
        toast("Check your email for your verification code.");

        const token = window.prompt(
          "Enter the six-digit verification code sent to your email:"
        );

        if (!token || !/^\d{6}$/.test(token.trim())) {
          toast("Enter the six-digit code exactly as received.", "error");
          return;
        }

        const { data: verifyData, error: verifyError } =
          await supabase.auth.verifyOtp({
            email,
            token: token.trim(),
            type: "signup"
          });

        if (verifyError) throw verifyError;

        state.session = verifyData.session;

        if (phoneCountry && phoneNumber && verifyData.user) {
          const { error: phoneSaveError } = await supabase
            .from("profiles")
            .upsert({
              id: verifyData.user.id,
              country_calling_code: phoneCountry,
              phone_number: phoneNumber,
              phone_is_public: false,
              updated_at: new Date().toISOString()
            }, { onConflict: "id" });

          if (phoneSaveError) {
            console.error("Phone save error:", phoneSaveError);
          }
        }

        await fetchProfile();
        closeDialog($("#authDialog"));
        await afterLogin();
        toast("Your email is verified. Welcome to LearnLoop!");
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
    if ($("#authMessage")) {
      $("#authMessage").textContent = error.message;
    }
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
  await loadFollowingIds();
   await loadFollowingIds();
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

const welcomeScreen = document.getElementById("welcomeScreen");
const appShell = document.querySelector(".app-shell");

if (welcomeScreen) {
  welcomeScreen.classList.toggle("hidden", !!session);
}

if (appShell) {
  appShell.classList.toggle("hidden", !session);
}

updateWelcomeAuthMode();
    await loadPosts();
    await updateDashboard();
  }, 0);
});
async function loadFollowingIds() {
  const userId = currentUserId();

  state.followingIds.clear();

  if (!userId) return;

  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (error) {
    console.error("Could not load followed users:", error);
    return;
  }

   (data || []).forEach(row => {
    state.followingIds.add(row.following_id);
  });
}
/* ---------- Navigation ---------- */

async function navigate(view) {
  const allowed = Object.keys(VIEW_INFO);
  if (!allowed.includes(view)) return;

 if (
  ["people", "following", "saved", "myuploads", "notifications", "dashboard", "messages"].includes(view) &&
  !state.session
) {
    openDialog("authDialog");
    return;
  }

  state.currentView = view;
   if (view === "people") {
  await loadFollowingIds();
  await loadPeople();
}

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
   messages: "messagesView", 
    community: "communityView",
    following: "followingView",
    saved: "savedView",
    myuploads: "myuploadsView",
    notifications: "notificationsView",
    dashboard: "dashboardView",
     people: "peopleView"
  };

  // Hide every page, including the Library, before showing the chosen page.
  Object.values(pageIds).forEach(id => {
    document.getElementById(id)?.classList.add("hidden");
  });

  const selectedPage = document.getElementById(pageIds[view]);

  if (selectedPage) {
    selectedPage.classList.remove("hidden");
    selectedPage.style.removeProperty("display");
    selectedPage.style.removeProperty("visibility");
  } else {
    console.error("LearnLoop page not found:", pageIds[view]);
  }

  closeMobileMenu();
  renderAllFeeds();

  if (view === "dashboard") updateDashboard();
  if (view === "library") searchBooks();
   
  if (view === "youtube") {
    const youtubeInput = document.getElementById("youtubeSearchInput");
    const youtubeResults = document.getElementById("youtubeResults");

    if (youtubeInput && youtubeResults && !youtubeResults.children.length) {
      if (!youtubeInput.value.trim()) {
        youtubeInput.value = "educational videos";
      }
      searchYouTubeVideos();
    }
  }

  if (view === "messages") loadConversations();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMobileMenu() {
  $("#sidebar")?.classList.add("open");
}

function closeMobileMenu() {
  $("#sidebar")?.classList.remove("open");
}

/* ---------- Post loading and publishing ---------- */



/* ---------- LearnLoop private messaging ---------- */

let activeConversationId = null;

async function searchMessageUsers(event) {
  event?.preventDefault();

  if (!requireLogin()) return;

  const input = $("#messageUserSearch");
  const results = $("#messageUserResults");
  if (!input || !results) return;

  const term = input.value.trim();

  if (term.length < 2) {
    results.textContent = "Enter at least 2 characters.";
    return;
  }

  results.textContent = "Searching learners...";

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", `%${term}%`)
    .neq("id", currentUserId())
    .limit(10);

  if (error) {
    console.error("Learner search error:", error);
    results.textContent = "Could not search learners. Check profile permissions.";
    return;
  }

  if (!data?.length) {
    results.textContent = "No learners found.";
    return;
  }

  results.innerHTML = data.map(user => `
    <div class="message-user-result">
      <span>${escapeHTML(user.display_name || "Learner")}</span>
      <button
        type="button"
        class="button button-primary"
        data-message-user="${escapeHTML(user.id)}"
      >Message</button>
    </div>
  `).join("");
}

async function startPrivateConversation(otherUserId) {
  if (!requireLogin() || !otherUserId) return;

  const { data, error } = await supabase.rpc(
    "create_private_conversation",
    { other_user_id: otherUserId }
  );

  if (error) {
    console.error("Create conversation error:", error);
    setStatus("Could not start the conversation. Please try again.", "error");
    return;
  }

  activeConversationId = data;
  await loadConversations();
  await openPrivateConversation(data);
}

async function loadConversations() {
  const list = $("#conversationList");
  if (!list || !currentUserId()) return;

  list.textContent = "Loading conversations...";

  const { data: memberships, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId());

  if (error) {
    console.error("Conversation list error:", error);
    list.textContent = "Could not load conversations.";
    return;
  }

  if (!memberships?.length) {
    list.textContent = "No conversations yet. Search for a learner to start one.";
    return;
  }

  const conversationIds = [...new Set(
    memberships.map(item => item.conversation_id)
  )];

  const { data: members, error: memberError } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", conversationIds);

  if (memberError) {
    console.error("Conversation members error:", memberError);
    list.textContent = "Could not load conversation members.";
    return;
  }

  const otherUserIds = [...new Set(
    (members || [])
      .filter(item => item.user_id !== currentUserId())
      .map(item => item.user_id)
  )];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", otherUserIds);

  if (profileError) {
    console.error("Conversation profiles error:", profileError);
    list.textContent = "Could not load learner names.";
    return;
  }

  const names = new Map(
    (profiles || []).map(profile => [
      profile.id,
      profile.display_name || "Learner"
    ])
  );

  list.innerHTML = conversationIds.map(id => {
    const member = (members || []).find(item =>
      item.conversation_id === id &&
      item.user_id !== currentUserId()
    );

    const name = names.get(member?.user_id) || "Learner";
    return `
      <button
        type="button"
        class="message-conversation-item"
        data-open-conversation="${escapeHTML(id)}"
      >${escapeHTML(name)}</button>
    `;
  }).join("");
}

async function openPrivateConversation(conversationId) {
  if (!conversationId || !currentUserId()) return;

  activeConversationId = conversationId;

  const { data: membership, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUserId())
    .maybeSingle();

  if (membershipError || !membership) {
    setStatus("You cannot open that conversation.", "error");
    return;
  }

  const { data: members, error: memberError } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);

  if (memberError) {
    setStatus("Could not load conversation details.", "error");
    return;
  }

  const otherId = members?.find(
    member => member.user_id !== currentUserId()
  )?.user_id;

  let partnerName = "Private conversation";

  if (otherId) {
    const { data: partner } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", otherId)
      .maybeSingle();

    if (partner?.display_name) partnerName = partner.display_name;
  }

  if ($("#chatPartnerName")) {
    $("#chatPartnerName").textContent = partnerName;
  }

  $("#chatEmptyState")?.classList.add("hidden");
  $("#chatPanel")?.classList.remove("hidden");

  await loadPrivateMessages(conversationId);
}

async function loadPrivateMessages(conversationId) {
  const list = $("#messageList");
  if (!list) return;

  list.textContent = "Loading messages...";

  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("Load messages error:", error);
    list.textContent = "Could not load messages.";
    return;
  }

  if (!data?.length) {
    list.textContent = "No messages yet. Say hello!";
    return;
  }

  list.innerHTML = data.map(message => `
    <div class="private-message ${
      message.sender_id === currentUserId() ? "own-message" : ""
    }">
      <p>${escapeHTML(message.body)}</p>
      <small>${new Date(message.created_at).toLocaleString()}</small>
    </div>
  `).join("");

  list.scrollTop = list.scrollHeight;
}

async function sendPrivateMessage(event) {
  event.preventDefault();

  if (!requireLogin()) return;
  if (!activeConversationId) {
    setStatus("Choose a conversation first.", "error");
    return;
  }

  const input = $("#messageInput");
  const body = input?.value.trim();

  if (!body) return;

  const button = $("#messageForm button[type='submit']");
  if (button) button.disabled = true;

  const { error } = await supabase.from("messages").insert({
    conversation_id: activeConversationId,
    sender_id: currentUserId(),
    body
  });

  if (button) button.disabled = false;

  if (error) {
    console.error("Send message error:", error);
    setStatus("Message could not be sent.", "error");
    return;
  }

  input.value = "";
  await loadPrivateMessages(activeConversationId);
}

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
   
async function loadFollowingIds() {
  const userId = currentUserId();

  state.followingIds.clear();

  if (!userId) return;

  const { data, error } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (error) {
    console.error("Could not load followed users:", error);
    return;
  }

  (data || []).forEach(row => {
    state.followingIds.add(row.following_id);
  });
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
  status: "published",
  card_color: $("#postCardColor")?.value || "#FFFFFF"
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
  placeholder="Write a helpful comment…">
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
  posts = posts.filter(post =>
    state.followingIds.has(post.user_id)
  );
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
  "No posts from people you follow yet",
  "Visit People to follow learners. Their published posts will appear here."
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
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true }),
    supabase
     .from("profiles")
.select("id, display_name, bio")
.order("display_name", { ascending: true })
  ]);

  if ($("#hostPostsCount")) {
    $("#hostPostsCount").textContent = String(posts.count ?? "—");
  }

  if (profiles.error) {
    console.error("Registered profiles load error:", profiles.error);
console.error("Profile error message:", profiles.error?.message);
console.error("Profile error code:", profiles.error?.code);
    if ($("#hostProfilesCount")) {
      $("#hostProfilesCount").textContent = "—";
    }

    if ($("#hostProfilesList")) {
      $("#hostProfilesList").innerHTML =
        '<p class="muted">Could not load profiles. Check Supabase permissions.</p>';
    }
  } else {
    const registeredProfiles = profiles.data || [];

    if ($("#hostProfilesCount")) {
      $("#hostProfilesCount").textContent =
        String(profiles.count ?? registeredProfiles.length);
    }

    if ($("#hostProfilesList")) {
      $("#hostProfilesList").innerHTML = registeredProfiles.length
        ? registeredProfiles.map(profile => {
            const name = profile.display_name || "LearnLoop learner";
            const bio = profile.bio || "";

            return `
              <article class="card">
                <strong>${escapeHTML(name)}</strong>
                <p class="muted small">${escapeHTML(bio || "No bio added yet.")}</p>
              </article>
            `;
          }).join("")
        : '<p class="muted">No profiles were returned.</p>';
    }
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

   async function loadCommitteeMembers() {
  const list = $("#committeeMembersList");
  if (!list || !isOwner()) return;

  list.textContent = "Loading committee members…";

  const { data, error } = await supabase
    .from("committee_members")
    .select("id, email, role, responsibilities, active")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load committee members.";
    console.error(error);
    return;
  }

  list.replaceChildren();

  if (!data?.length) {
    list.textContent = "No committee members appointed yet.";
    return;
  }

  data.forEach(member => {
    const card = document.createElement("article");
    card.className = "card";

    const heading = document.createElement("h4");
    heading.textContent = member.role;

    const email = document.createElement("p");
    email.textContent = member.email;

    const duties = document.createElement("p");
    duties.textContent = member.responsibilities || "No responsibilities specified.";

    const status = document.createElement("p");
    status.textContent = member.active ? "Active" : "Inactive";

    card.append(heading, email, duties, status);
    list.append(card);
  });
}

async function appointCommitteeMember() {
  if (!isOwner()) {
    toast("Only the platform owner can appoint committee members.", "error");
    return;
  }

  const email = $("#committeeMemberEmail")?.value.trim();
  const role = $("#committeeMemberRole")?.value;
  const responsibilities =
    $("#committeeMemberResponsibilities")?.value.trim() || "";

  if (!email) {
    toast("Enter the member's registered email.", "error");
    return;
  }

  const { error } = await supabase.rpc(
    "host_appoint_committee_member",
    {
      p_email: email,
      p_role: role,
      p_responsibilities: responsibilities
    }
  );

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Committee member appointed successfully.", "success");
  $("#committeeMemberEmail").value = "";
  $("#committeeMemberResponsibilities").value = "";

  await loadCommitteeMembers();
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
  const input = document.getElementById("youtubeSearchInput");
  const results = document.getElementById("youtubeResults");
  const status = document.getElementById("youtubeStatus");

  if (!input || !results || !status) {
    console.error("LearnLoop: YouTube search elements are missing.");
    return;
  }

  const query = input.value.trim();

  if (!query) {
    status.textContent = "Enter a subject or lesson to search.";
    return;
  }

  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

  if (!apiKey) {
    status.textContent =
      "YouTube API key is missing from this deployment. Check Vercel Environment Variables.";
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
      const message =
        data.error?.message || `YouTube request failed (${response.status}).`;

      console.error("YouTube API response:", response.status, data);
      status.textContent = `YouTube error: ${message}`;
      return;
    }

    const videos = (data.items || []).filter(
      video => video.id?.videoId && video.snippet
    );

    if (!videos.length) {
      status.textContent =
        "No videos found for this search. Try Mathematics, Biology, or English.";
      return;
    }

    videos.forEach(video => {
      const videoId = video.id.videoId;
      const title = video.snippet.title;
      const channel = video.snippet.channelTitle;
      const thumbnail =
        video.snippet.thumbnails?.medium?.url ||
        video.snippet.thumbnails?.default?.url ||
        "";

      const card = document.createElement("article");
      card.className = "youtube-card";

      const image = document.createElement("img");
      image.src = thumbnail;
      image.alt = `Thumbnail for ${title}`;
      image.loading = "lazy";

      const heading = document.createElement("h3");
      heading.textContent = title;

      const channelText = document.createElement("p");
      channelText.textContent = channel;

     
      function openVideo() {
        const panel = document.getElementById("youtubePlayerPanel");
        const player = document.getElementById("youtubePlayer");
        const playerTitle = document.getElementById("youtubePlayerTitle");

        if (!panel || !player || !playerTitle) {
          status.textContent = "The video player is missing from index.html.";
          return;
        }

        playerTitle.textContent = title;
        player.src =
          `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;

        panel.classList.remove("hidden");
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      image.style.cursor = "pointer";
      image.title = "Click to play this video";
      image.addEventListener("click", openVideo);
       
     
      heading.style.cursor = "pointer";
      heading.addEventListener("click", openVideo);

card.append(image, heading, channelText);
      results.append(card);
    });

    status.textContent =
      `Found ${videos.length} videos. Choose a lesson to watch.`;
  } catch (error) {
    console.error("LearnLoop YouTube search error:", error);
    status.textContent =
      `Could not load videos: ${error.message}. Check your connection and API settings.`;
  }
}



/* ---------- Event wiring ---------- */

const learnLoopLessons = [
  {
    subject: "Science",
    title: "Why does Earth have seasons?",
    description: "Discover how Earth's tilted axis changes sunlight throughout the year.",
    image: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=800&q=80",
    link: "https://science.nasa.gov/"
  },
  {
    subject: "Mathematics",
    title: "Understanding algebra",
    description: "Learn how letters represent unknown numbers and how to solve simple equations.",
    image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math"
  },
  {
    subject: "Reading",
    title: "Become a better reader",
    description: "Practise identifying main ideas, taking notes, and remembering what you read.",
    image: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=800&q=80",
    link: "https://openstax.org/"
  },
  {
    subject: "Technology",
    title: "How does the internet work?",
    description: "Explore how computers exchange information across connected networks.",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/computing"
  },
  {
    subject: "Health",
    title: "Understanding healthy habits",
    description: "Explore sleep, movement, hygiene, and everyday habits that support wellbeing.",
    image: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics"
  },
  {
    subject: "Business",
    title: "Introduction to entrepreneurship",
    description: "Learn how people identify problems, develop ideas, and create useful services.",
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sba.gov/business-guide"
  },
  {
    subject: "Languages",
    title: "Build your vocabulary",
    description: "Learn new words by reading, writing examples, and using them in conversation.",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80",
    link: "https://www.bbc.co.uk/learningenglish"
  },
  {
    subject: "Social Development",
    title: "The value of teamwork",
    description: "Discover how communication, cooperation, and shared goals help communities.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    link: "https://www.un.org/sustainabledevelopment/"
  },
  {
    subject: "Science",
    title: "How do plants make food?",
    description: "Understand photosynthesis and how plants use sunlight, water, and carbon dioxide.",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/biology"
  },
  {
    subject: "Mathematics",
    title: "Fractions in everyday life",
    description: "Explore fractions, equivalent values, and practical examples.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math"
  },
  {
    subject: "Technology",
    title: "Learn the basics of coding",
    description: "Discover variables, instructions, and how programs solve problems.",
    image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/computing"
  },
  {
    subject: "Health",
    title: "Understanding nutrition",
    description: "Learn about nutrients and how a varied diet supports everyday health.",
    image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/nutrition"
  },
  {
    subject: "Languages",
    title: "Master English grammar basics",
    description: "Practise sentence structure, parts of speech, and clear communication.",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80",
    link: "https://www.bbc.co.uk/learningenglish"
  },
  {
    subject: "Business",
    title: "Understanding budgeting",
    description: "Learn to plan income, expenses, savings, and spending decisions.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sba.gov/business-guide"
  },
  {
    subject: "Social Development",
    title: "Introduction to community development",
    description: "Explore how communities identify needs and organise local improvements.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    link: "https://www.undp.org/"
  },
  {
    subject: "Reading",
    title: "How to identify a main idea",
    description: "Practise finding the central message and supporting details in a text.",
    image: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=800&q=80",
    link: "https://openstax.org/"
  },
  {
    subject: "Science",
    title: "The water cycle explained",
    description: "Discover evaporation, condensation, precipitation, and collection.",
    image: "https://images.unsplash.com/photo-1437482078695-73f5ca6c96e2?auto=format&fit=crop&w=800&q=80",
    link: "https://science.nasa.gov/"
  },
  {
    subject: "Mathematics",
    title: "Geometry in the world around us",
    description: "Explore shapes, angles, area, and geometry in everyday objects.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/geometry"
  },
  {
    subject: "Technology",
    title: "Staying safe online",
    description: "Learn about strong passwords, privacy, scams, and responsible internet use.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://staysafeonline.org/"
  },
  {
    subject: "Health",
    title: "Understanding mental wellbeing",
    description: "Learn about healthy routines, managing stress, and finding support.",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/mental-health"
  }
     ,
  {
    subject: "Technology",
    title: "Introduction to HTML",
    description: "Learn how HTML structures webpages using headings, paragraphs, links, and images.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content"
  },
  {
    subject: "Technology",
    title: "CSS: Styling Your First Website",
    description: "Learn colors, fonts, spacing, borders, and layouts to make webpages attractive.",
    image: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics"
  },
  {
    subject: "Technology",
    title: "JavaScript Fundamentals",
    description: "Explore variables, functions, conditions, and interactive webpage behavior.",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting"
  },
  {
    subject: "Technology",
    title: "Python Programming for Beginners",
    description: "Discover variables, loops, functions, and simple programs with Python.",
    image: "https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=800&q=80",
    link: "https://www.python.org/about/gettingstarted/"
  },
  {
    subject: "Technology",
    title: "Algorithms and Problem Solving",
    description: "Break complex problems into smaller steps and design clear solutions.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/computing/computer-science/algorithms"
  },
  {
    subject: "Technology",
    title: "Git and GitHub Basics",
    description: "Learn how to track code changes, save versions, and collaborate on projects.",
    image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=800&q=80",
    link: "https://docs.github.com/en/get-started"
  },
  {
    subject: "Social Development",
    title: "Personal Accountability",
    description: "Understand how to take responsibility for your actions, choices, and commitments.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Integrity and Ethical Decisions",
    description: "Practice honesty, fairness, and ethical decision-making in everyday situations.",
    image: "https://images.unsplash.com/photo-1529390079861-591de354faf5?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Transparency and Record Keeping",
    description: "Learn why clear records, accurate information, and open processes build trust.",
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&q=80",
    link: "https://www.accountingcoach.com/"
  },
  {
    subject: "Social Development",
    title: "Leadership and Responsibility",
    description: "Explore how responsible leaders set clear goals, support others, and follow through.",
    image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Business",
    title: "Introduction to Bookkeeping",
    description: "Learn to organize income, expenses, receipts, and financial records accurately.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.accountingcoach.com/"
  },
  {
    subject: "Social Development",
    title: "Teamwork and Shared Accountability",
    description: "Discover how teams divide responsibilities, communicate progress, and meet shared goals.",
    image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Technology",
    title: "HTML Forms and User Input",
    description: "Learn to create forms with text fields, labels, buttons, and validation.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms"
  },
  {
    subject: "Technology",
    title: "Responsive Web Design",
    description: "Build webpages that adapt to phones, tablets, and desktop screens.",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design"
  },
  {
    subject: "Technology",
    title: "CSS Flexbox Layout",
    description: "Arrange website elements into flexible rows and columns.",
    image: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Flexbox"
  },
  {
    subject: "Technology",
    title: "CSS Grid Layout",
    description: "Create structured two-dimensional layouts for modern websites.",
    image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Grids"
  },
  {
    subject: "Technology",
    title: "JavaScript Variables and Data Types",
    description: "Understand strings, numbers, booleans, variables, and basic data storage.",
    image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting"
  },
  {
    subject: "Technology",
    title: "JavaScript Functions",
    description: "Learn to write reusable functions, pass arguments, and return results.",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions"
  },
  {
    subject: "Technology",
    title: "JavaScript Arrays and Objects",
    description: "Store, organize, and work with collections of information in your programs.",
    image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide"
  },
  {
    subject: "Technology",
    title: "Debugging Code",
    description: "Learn how to find errors, read console messages, and test solutions.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Debugging_JavaScript"
  },
  {
    subject: "Technology",
    title: "Introduction to APIs",
    description: "Understand how applications exchange information through web APIs.",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs"
  },
  {
    subject: "Technology",
    title: "Web Accessibility Basics",
    description: "Design websites that are easier for people with different abilities to use.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility"
  },
  {
    subject: "Social Development",
    title: "Taking Personal Responsibility",
    description: "Recognize your responsibilities and follow through on your commitments.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Accountability in the Workplace",
    description: "Understand how people report progress, own decisions, and meet agreed standards.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Transparency and Trust",
    description: "Explore how honest communication and clear processes build public trust.",
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&q=80",
    link: "https://www.transparency.org/en/what-is-corruption"
  },
  {
    subject: "Social Development",
    title: "Ethical Decision-Making",
    description: "Use fairness, evidence, and shared values to make responsible decisions.",
    image: "https://images.unsplash.com/photo-1529390079861-591de354faf5?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/ethics-science-and-technology"
  },
  {
    subject: "Social Development",
    title: "Accepting Feedback",
    description: "Learn to receive feedback constructively and use it to improve your work.",
    image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Conflict Resolution",
    description: "Practice listening, identifying shared interests, and finding fair solutions.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Delegation and Responsibility",
    description: "Learn how to assign tasks clearly, agree on deadlines, and follow up fairly.",
    image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },
  {
    subject: "Social Development",
    title: "Monitoring Progress and Results",
    description: "Set measurable goals, track activities, and evaluate whether objectives are met.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.betterevaluation.org/"
  },
  {
    subject: "Business",
    title: "Budgeting and Financial Accountability",
    description: "Plan spending, record transactions, and compare actual costs against a budget.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.accountingcoach.com/"
  },
  {
    subject: "Social Development",
    title: "Responsible Community Leadership",
    description: "Learn how leaders involve communities, explain decisions, and answer for results.",
    image: "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unesco.org/en/education"
  },

  {
    subject: "Mathematics",
    title: "Fractions Made Simple",
    description: "Understand numerators, denominators, equivalent fractions, and fraction operations.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic"
  },
  {
    subject: "Mathematics",
    title: "Percentages in Everyday Life",
    description: "Calculate percentages for discounts, comparisons, marks, and everyday decisions.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/arithmetic/arith-review-percent"
  },
  {
    subject: "Mathematics",
    title: "Ratios and Proportions",
    description: "Compare quantities and solve proportion problems in practical situations.",
    image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/pre-algebra/pre-algebra-ratios-rates"
  },
  {
    subject: "Mathematics",
    title: "Introduction to Algebra",
    description: "Explore variables, algebraic expressions, and basic mathematical rules.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/algebra"
  },
  {
    subject: "Mathematics",
    title: "Solving Linear Equations",
    description: "Learn step-by-step methods for finding unknown values in equations.",
    image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/algebra/one-variable-linear-equations"
  },
  {
    subject: "Mathematics",
    title: "Geometry and Shapes",
    description: "Study angles, triangles, circles, polygons, and their properties.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/geometry"
  },
  {
    subject: "Mathematics",
    title: "Statistics and Data",
    description: "Learn mean, median, mode, range, and how to interpret datasets.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/statistics-probability"
  },
  {
    subject: "Mathematics",
    title: "Probability Basics",
    description: "Understand chance, possible outcomes, and simple probability calculations.",
    image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/statistics-probability/probability-library"
  },
  {
    subject: "Mathematics",
    title: "Reading Graphs and Charts",
    description: "Interpret bar charts, line graphs, and tables to understand information.",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/statistics-probability"
  },
  {
    subject: "Mathematics",
    title: "Practical Measurement",
    description: "Apply units, conversions, area, volume, and measurement to real problems.",
    image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/math/geometry"
  },
  {
    subject: "Science",
    title: "The Scientific Method",
    description: "Learn how to ask questions, form hypotheses, test ideas, and draw conclusions.",
    image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sciencebuddies.org/science-fair-projects/science-fair"
  },
  {
    subject: "Science",
    title: "Cells and Their Functions",
    description: "Discover the basic structures of cells and how they support living organisms.",
    image: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/biology/structure-of-a-cell"
  },
  {
    subject: "Science",
    title: "Ecosystems and Food Chains",
    description: "Explore how living things interact and how energy moves through ecosystems.",
    image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/biology/ecology"
  },
  {
    subject: "Science",
    title: "Forces and Motion",
    description: "Understand motion, speed, acceleration, and the forces that affect objects.",
    image: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/physics/forces-newtons-laws"
  },
  {
    subject: "Science",
    title: "Electricity Fundamentals",
    description: "Explore electric circuits, current, voltage, resistance, and electrical safety.",
    image: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/physics/circuits-topic"
  },
  {
    subject: "Science",
    title: "States of Matter",
    description: "Compare solids, liquids, and gases and learn how matter changes state.",
    image: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/chemistry/states-of-matter-and-intermolecular-forces"
  },
  {
    subject: "Science",
    title: "Chemical Reactions",
    description: "Discover how substances react, form new products, and conserve atoms.",
    image: "https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/chemistry/chemical-reactions-stoichiome"
  },
  {
    subject: "Science",
    title: "Energy and Its Forms",
    description: "Learn about kinetic, potential, thermal, chemical, and electrical energy.",
    image: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/physics/work-and-energy"
  },
  {
    subject: "Science",
    title: "Weather and Climate",
    description: "Understand weather patterns, climate systems, rainfall, and temperature.",
    image: "https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?auto=format&fit=crop&w=800&q=80",
    link: "https://climate.nasa.gov/"
  },
  {
    subject: "Science",
    title: "The Human Body Systems",
    description: "Explore how the digestive, respiratory, circulatory, and nervous systems work.",
    image: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=800&q=80",
    link: "https://www.khanacademy.org/science/health-and-medicine"
  },

  {
    subject: "Health",
    title: "Introduction to Nursing",
    description: "Explore the role of nurses, professional responsibilities, compassionate care, and teamwork in healthcare.",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/nursing"
  },
  {
    subject: "Health",
    title: "Hand Hygiene in Healthcare",
    description: "Learn why hand hygiene is essential for preventing infections in healthcare settings.",
    image: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/teams/integrated-health-services/infection-prevention-control/hand-hygiene"
  },
  {
    subject: "Health",
    title: "Measuring Vital Signs",
    description: "Study temperature, pulse, respiratory rate, blood pressure, and the importance of accurate recording.",
    image: "https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=800&q=80",
    link: "https://medlineplus.gov/vitalsigns.html"
  },
  {
    subject: "Health",
    title: "Human Anatomy for Nurses",
    description: "Explore major organs and body systems to build a foundation for nursing education.",
    image: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=800&q=80",
    link: "https://medlineplus.gov/anatomy.html"
  },
  {
    subject: "Health",
    title: "Basic Patient Assessment",
    description: "Learn how healthcare professionals gather patient information, observe symptoms, and document findings.",
    image: "https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=800&q=80",
    link: "https://www.ncbi.nlm.nih.gov/books/"
  },
  {
    subject: "Health",
    title: "Patient Safety and Infection Prevention",
    description: "Understand common patient safety risks, infection prevention, and safe clinical environments.",
    image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/patient-safety"
  },
  {
    subject: "Health",
    title: "Nursing Ethics and Confidentiality",
    description: "Explore patient dignity, privacy, informed consent, professional boundaries, and ethical responsibilities.",
    image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80",
    link: "https://www.icn.ch/"
  },
  {
    subject: "Health",
    title: "Communication with Patients",
    description: "Develop active listening, respectful communication, empathy, and clear explanations for patients.",
    image: "https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/patient-safety"
  },
  {
    subject: "Health",
    title: "First Aid and Emergency Awareness",
    description: "Learn how to recognize emergencies, seek qualified assistance, and understand basic first-aid principles.",
    image: "https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=800&q=80",
    link: "https://www.redcross.org/take-a-class/first-aid"
  },
  {
    subject: "Health",
    title: "Nutrition and Patient Care",
    description: "Study basic nutrients, hydration, balanced diets, and the role of nutrition in patient wellbeing.",
    image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/healthy-diet"
  },
  {
    subject: "Health",
    title: "Medication Safety Fundamentals",
    description: "Understand medication labels, accurate documentation, allergy awareness, and the importance of following authorized instructions.",
    image: "https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/initiatives/medication-without-harm"
  },
  {
    subject: "Health",
    title: "Nursing Documentation and Handover",
    description: "Learn why clinical records must be clear, factual, timely, and handled confidentially.",
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/patient-safety"
  },
  {
    subject: "Business",
    title: "Introduction to Accounting",
    description: "Discover assets, liabilities, equity, income, expenses, and the basic accounting equation.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.accountingcoach.com/"
  },
  {
    subject: "Business",
    title: "Understanding Financial Statements",
    description: "Learn what income statements, balance sheets, and cash flow statements communicate.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.accountingcoach.com/"
  },
  {
    subject: "Business",
    title: "Managing Cash Flow",
    description: "Understand money coming into and leaving a business and why cash flow planning matters.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sba.gov/business-guide/manage-your-business/manage-your-finances"
  },
  {
    subject: "Business",
    title: "Preparing a Simple Budget",
    description: "Create a practical budget, estimate expenses, plan savings, and compare spending with targets.",
    image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80",
    link: "https://www.consumerfinance.gov/consumer-tools/budgeting/"
  },
  {
    subject: "Business",
    title: "Entrepreneurship Fundamentals",
    description: "Learn to identify customer needs, evaluate ideas, and develop a basic business model.",
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sba.gov/business-guide"
  },
  {
    subject: "Business",
    title: "Internal Controls and Accountability",
    description: "Explore approvals, accurate records, separation of duties, and checks that reduce financial errors.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.accountingcoach.com/"
  },
  {
    subject: "Business",
    title: "Inventory and Stock Management",
    description: "Learn how to record stock, monitor supplies, reduce waste, and maintain accurate inventory.",
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sba.gov/business-guide"
  },
  {
    subject: "Business",
    title: "Ethical Financial Reporting",
    description: "Understand honesty, supporting evidence, transparent reporting, and responsible financial decisions.",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.ifac.org/"
  },

  {
    subject: "Languages",
    title: "English Grammar Fundamentals",
    description: "Learn parts of speech, sentence structure, subject-verb agreement, and correct punctuation.",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80",
    link: "https://learnenglish.britishcouncil.org/grammar"
  },
  {
    subject: "Languages",
    title: "Building English Vocabulary",
    description: "Expand your vocabulary through context, word families, synonyms, and antonyms.",
    image: "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=800&q=80",
    link: "https://learnenglish.britishcouncil.org/vocabulary"
  },
  {
    subject: "Languages",
    title: "Writing Clear English Paragraphs",
    description: "Practice topic sentences, supporting details, logical order, and concluding sentences.",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80",
    link: "https://owl.purdue.edu/owl/general_writing/academic_writing/paragraphs_and_paragraphing/index.html"
  },
  {
    subject: "Languages",
    title: "Essay Writing Skills",
    description: "Learn how to plan, organize, draft, and revise a well-structured essay.",
    image: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=800&q=80",
    link: "https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/index.html"
  },
  {
    subject: "Languages",
    title: "Public Speaking and Presentation",
    description: "Develop confidence, organize ideas, and deliver clear presentations to an audience.",
    image: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=800&q=80",
    link: "https://www.toastmasters.org/resources/public-speaking-tips"
  },
  {
    subject: "Languages",
    title: "French Grammar Basics",
    description: "Study French articles, pronouns, adjective agreement, and common sentence patterns.",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80",
    link: "https://www.lawlessfrench.com/grammar/"
  },
  {
    subject: "Languages",
    title: "Everyday French Conversation",
    description: "Practice greetings, introductions, asking questions, and useful everyday expressions.",
    image: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=800&q=80",
    link: "https://apprendre.tv5monde.com/en"
  },
  {
    subject: "Languages",
    title: "English Listening Comprehension",
    description: "Improve listening through short talks, identifying key ideas, and understanding context.",
    image: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=800&q=80",
    link: "https://learnenglish.britishcouncil.org/skills/listening"
  },
  {
    subject: "Reading",
    title: "Reading Comprehension Strategies",
    description: "Learn to identify main ideas, supporting details, purpose, and important evidence in texts.",
    image: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=800&q=80",
    link: "https://www.readingrockets.org/"
  },
  {
    subject: "Reading",
    title: "Critical Thinking While Reading",
    description: "Evaluate claims, identify assumptions, distinguish facts from opinions, and question evidence.",
    image: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=800&q=80",
    link: "https://www.skillsyouneed.com/learn/critical-thinking.html"
  },
  {
    subject: "Reading",
    title: "Summarizing and Note-Taking",
    description: "Capture key ideas, organize notes, and summarize long texts in your own words.",
    image: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=800&q=80",
    link: "https://learningcenter.unc.edu/tips-and-tools/"
  },
  {
    subject: "Reading",
    title: "Research and Source Evaluation",
    description: "Find reliable information, check author credibility, and compare evidence across sources.",
    image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80",
    link: "https://owl.purdue.edu/owl/research_and_citation/conducting_research/index.html"
  },
  {
    subject: "Social Development",
    title: "Community Needs Assessment",
    description: "Learn how surveys, interviews, and observation help identify community priorities.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=800&q=80",
    link: "https://ctb.ku.edu/en/assessing-community-needs-and-resources"
  },
  {
    subject: "Social Development",
    title: "Community Project Planning",
    description: "Define a community problem, set objectives, identify activities, and plan resources.",
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    link: "https://www.betterevaluation.org/"
  },
  {
    subject: "Social Development",
    title: "Stakeholder Engagement",
    description: "Identify affected groups, listen to their perspectives, and involve them in decisions.",
    image: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unicef.org/evaluation"
  },
  {
    subject: "Social Development",
    title: "Monitoring and Evaluation",
    description: "Use indicators, data collection, and results analysis to assess project progress.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://www.betterevaluation.org/"
  },
  {
    subject: "Social Development",
    title: "Public Service Ethics",
    description: "Explore impartiality, integrity, fairness, responsible use of resources, and public trust.",
    image: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unodc.org/"
  },
  {
    subject: "Social Development",
    title: "Community Participation and Inclusion",
    description: "Learn how to include different voices and reduce barriers to community participation.",
    image: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unicef.org/"
  },
  {
    subject: "Social Development",
    title: "Project Risk Management",
    description: "Identify potential project problems, assess their likelihood, and plan responses.",
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    link: "https://www.pmi.org/learning/library"
  },
  {
    subject: "Social Development",
    title: "Writing Project Reports",
    description: "Prepare clear reports covering objectives, activities, results, challenges, and recommendations.",
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&q=80",
    link: "https://owl.purdue.edu/owl/subject_specific_writing/professional_technical_writing/index.html"
  },

  {
    subject: "Technology",
    title: "Computer Fundamentals",
    description: "Understand computer hardware, software, operating systems, and basic computer operations.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://edu.gcfglobal.org/en/computerbasics/"
  },
  {
    subject: "Technology",
    title: "Organizing Digital Files",
    description: "Learn how to create folders, name files clearly, organize documents, and maintain backups.",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80",
    link: "https://edu.gcfglobal.org/en/computerbasics/"
  },
  {
    subject: "Technology",
    title: "Spreadsheet Skills",
    description: "Practice entering data, using formulas, sorting information, and creating simple charts.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    link: "https://edu.gcfglobal.org/en/excel/"
  },
  {
    subject: "Technology",
    title: "Creating Effective Presentations",
    description: "Design clear slides with readable text, useful visuals, and a logical flow of ideas.",
    image: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=800&q=80",
    link: "https://edu.gcfglobal.org/en/powerpoint/"
  },
  {
    subject: "Technology",
    title: "Online Privacy and Security",
    description: "Learn to protect personal information, recognize suspicious messages, and use secure accounts.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://staysafeonline.org/"
  },
  {
    subject: "Technology",
    title: "Evaluating Online Information",
    description: "Check sources, dates, evidence, and credibility before trusting or sharing online information.",
    image: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80",
    link: "https://edu.gcfglobal.org/en/internetbasics/"
  },
  {
    subject: "Technology",
    title: "Introduction to Databases",
    description: "Understand tables, records, fields, and how databases organize information.",
    image: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=800&q=80",
    link: "https://www.w3schools.com/sql/"
  },
  {
    subject: "Technology",
    title: "Digital Citizenship",
    description: "Practice respectful online communication, responsible sharing, and ethical digital participation.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unicef.org/globalinsight/reports/childrens-rights-digital-age"
  },
  {
    subject: "Social Development",
    title: "Introduction to Sustainable Development",
    description: "Explore how social wellbeing, economic opportunity, and environmental protection connect.",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80",
    link: "https://sdgs.un.org/goals"
  },
  {
    subject: "Social Development",
    title: "Waste Management and Recycling",
    description: "Learn about waste reduction, sorting, reuse, recycling, and responsible disposal.",
    image: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80",
    link: "https://www.unep.org/"
  },
  {
    subject: "Social Development",
    title: "Biodiversity and Conservation",
    description: "Understand biodiversity, threats to ecosystems, and ways to protect wildlife and habitats.",
    image: "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=800&q=80",
    link: "https://www.worldwildlife.org/"
  },
  {
    subject: "Social Development",
    title: "Climate Change Awareness",
    description: "Explore the causes and effects of climate change and practical approaches to adaptation.",
    image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80",
    link: "https://climate.nasa.gov/"
  },
  {
    subject: "Social Development",
    title: "Water, Sanitation, and Hygiene",
    description: "Learn why safe water, sanitation facilities, and hygiene practices matter for communities.",
    image: "https://images.unsplash.com/photo-1530053969600-caed2596d242?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/water-sanitation-and-hygiene-wash"
  },
  {
    subject: "Health",
    title: "Understanding Mental Wellbeing",
    description: "Explore healthy routines, emotional wellbeing, stress management, and when to seek support.",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/mental-health"
  },
  {
    subject: "Health",
    title: "Sleep and Healthy Routines",
    description: "Understand the importance of regular sleep, balanced routines, and recovery for wellbeing.",
    image: "https://images.unsplash.com/photo-1511295742362-92c96b5a8d6e?auto=format&fit=crop&w=800&q=80",
    link: "https://www.cdc.gov/sleep/"
  },
  {
    subject: "Health",
    title: "Nutrition Labels and Food Choices",
    description: "Learn to interpret food labels and understand nutrients, ingredients, and serving information.",
    image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/healthy-diet"
  },
  {
    subject: "Health",
    title: "Preventing the Spread of Infection",
    description: "Study everyday infection prevention practices, respiratory hygiene, and appropriate handwashing.",
    image: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=80",
    link: "https://www.who.int/health-topics/infection-prevention-and-control"
  },
  {
    subject: "Business",
    title: "Personal Financial Planning",
    description: "Set financial goals, plan expenses, prepare for unexpected costs, and review progress.",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=800&q=80",
    link: "https://www.consumerfinance.gov/consumer-tools/"
  },
  {
    subject: "Business",
    title: "Customer Service and Communication",
    description: "Practice listening to customers, responding respectfully, and resolving complaints professionally.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=800&q=80",
    link: "https://www.sba.gov/business-guide"
  },
  {
    subject: "Social Development",
    title: "Goal Setting and Time Management",
    description: "Break goals into manageable tasks, prioritize activities, and review your progress consistently.",
    image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=800&q=80",
    link: "https://www.skillsyouneed.com/ps/time-management.html"
  },

];
function getAcademyReading(course, index) {
  // Keep the existing complete Leadership lessons unchanged.
  if (course.slug === "leadership") {
    return academyLeadershipLessons[index];
  }

  const lessons = {
    english: [
      {
        title: "Parts of Speech",
        paragraphs: [
          "Parts of speech describe the roles words play in sentences. Nouns name people, places, things, or ideas. Pronouns replace nouns. Verbs express actions or states. Adjectives describe nouns, while adverbs often describe verbs, adjectives, or other adverbs.",
          "Other important parts of speech include prepositions, which express relationships such as location or time; conjunctions, which connect words or clauses; and interjections, which express sudden feelings. For example, in 'The hardworking student carefully completed the assignment,' student is a noun, hardworking is an adjective, completed is a verb, and carefully is an adverb.",
          "A word's grammatical role can depend on its context. Study complete sentences rather than memorizing isolated words. Identifying parts of speech helps you build correct sentences, improve reading comprehension, and express ideas more precisely."
        ],
        keyPoint: "Recognize nouns, pronouns, verbs, adjectives, adverbs, prepositions, conjunctions, and interjections in context."
      },
      {
        title: "Building Correct Sentences",
        paragraphs: [
          "A sentence expresses a complete thought. Many sentences contain a subject, which tells us who or what the sentence concerns, and a predicate, which tells us something about that subject. For example, 'The learners discussed the lesson' has learners as its subject and discussed the lesson as its predicate.",
          "Sentences may be simple, compound, or complex. A simple sentence contains one independent clause. A compound sentence joins independent clauses, often using words such as and, but, or so. A complex sentence contains an independent clause and at least one dependent clause, such as 'We continued studying because the examination was approaching.'",
          "Correct sentence construction requires appropriate word order, agreement between subjects and verbs, and suitable punctuation. Avoid fragments that express incomplete thoughts and run-on sentences that join ideas incorrectly. Read your writing aloud and check that each sentence communicates one clear idea or a logically connected group of ideas."
        ],
        keyPoint: "Build complete sentences with clear subjects, correct verbs, logical structure, and appropriate punctuation."
      },
      {
        title: "Essential Grammar",
        paragraphs: [
          "Grammar provides the rules and patterns that help people communicate clearly. Important areas include verb tenses, subject–verb agreement, pronoun use, articles, prepositions, and punctuation. The present simple describes routines or general truths, while the past simple describes completed past events. The future can be expressed using forms such as 'will' or 'going to.'",
          "Subject–verb agreement means that a verb matches its subject. For example, 'She studies every evening' is correct, while 'She study every evening' is not. Articles such as a, an, and the help identify nouns. Pronouns should clearly refer to the people or things they replace, preventing confusion.",
          "Grammar improves through practice, reading, and revision. When you make a mistake, identify the rule involved and create another example using it correctly. In formal writing, check verb consistency, sentence structure, spelling, and punctuation before submitting your work."
        ],
        keyPoint: "Use consistent tenses, correct subject–verb agreement, clear pronouns, and appropriate punctuation."
      },
      {
        title: "Vocabulary Development",
        paragraphs: [
          "Vocabulary is the collection of words a person understands and uses. A strong vocabulary helps learners explain ideas accurately, understand texts, and participate confidently in conversations. Learn unfamiliar words in context because surrounding sentences often reveal their meanings better than memorizing definitions alone.",
          "Use a dictionary to check meaning, spelling, pronunciation, and word class. A thesaurus can suggest synonyms, but similar words do not always have identical meanings. For example, 'slim,' 'thin,' and 'narrow' may be related in some contexts but cannot always replace one another. Antonyms express contrasting meanings, while prefixes and suffixes can change a word's meaning or grammatical role.",
          "Keep a vocabulary notebook with each new word, its definition, an example sentence, and related words. Review entries regularly and use new vocabulary in speaking and writing. Reading books, news articles, and educational materials exposes you to words used in different contexts."
        ],
        keyPoint: "Learn words in context, verify meanings, review them regularly, and practise using them naturally."
      },
      {
        title: "Reading Comprehension",
        paragraphs: [
          "Reading comprehension is the ability to understand, interpret, and evaluate written information. Begin by identifying the topic and the author's main idea. Supporting details, examples, explanations, and evidence develop that main idea. A text may also contain a purpose, such as informing, explaining, persuading, or entertaining readers.",
          "Good readers make predictions, ask questions, use context to understand unfamiliar vocabulary, and distinguish facts from opinions. They can infer information that is suggested rather than directly stated. For example, if a passage says that dark clouds gathered and people opened their umbrellas, you may infer that rain was expected or falling.",
          "After reading, summarize the passage in your own words and identify its most important evidence. Check whether your interpretation is supported by the text rather than by assumptions. For examinations, read questions carefully, locate relevant passages, and answer precisely using evidence when required."
        ],
        keyPoint: "Identify main ideas, understand supporting details, make evidence-based inferences, and summarize accurately."
      },
      {
        title: "Writing Clear Paragraphs",
        paragraphs: [
          "A paragraph develops one central idea. Its topic sentence introduces the main point, supporting sentences explain or develop that point, and a concluding sentence may summarize it or connect it to the next paragraph. Not every paragraph needs a separate concluding sentence, but its ideas should remain focused and connected.",
          "Supporting details can include examples, facts, explanations, comparisons, or reasons. Transition words such as first, however, therefore, and for example show relationships between ideas. Avoid including unrelated information that distracts from the paragraph's purpose. For example, a paragraph about the benefits of reading should explain those benefits rather than suddenly discussing unrelated sports activities.",
          "Plan your paragraph before writing, organize the ideas logically, and use clear language appropriate for the audience. After drafting, check whether the topic sentence matches the supporting details. Correct spelling, grammar, repetition, and punctuation during revision."
        ],
        keyPoint: "Organize one central idea using a topic sentence, relevant supporting details, and logical connections."
      },
      {
        title: "Speaking and Everyday Communication",
        paragraphs: [
          "Effective speaking communicates ideas in a way listeners can understand. Consider your purpose and audience before choosing words. Speak at an appropriate pace, pronounce words clearly, and organize longer explanations into a logical beginning, middle, and conclusion. Simple, precise language is often more effective than unnecessarily complicated vocabulary.",
          "Everyday communication includes greetings, introductions, asking questions, giving directions, making requests, and expressing opinions politely. For example, 'Could you please explain the instructions again?' is a respectful way to request clarification. Tone matters because the same words can sound supportive, impatient, or disrespectful depending on delivery.",
          "Confidence grows through preparation and practice. Listen carefully when others speak, allow them to finish, and ask follow-up questions when something is unclear. When giving a short presentation, identify your main message, prepare key points, and practise aloud. Respectful communication includes recognizing different viewpoints and responding to disagreement without personal attacks."
        ],
        keyPoint: "Speak clearly, organize your ideas, listen actively, and adapt your language to the situation."
      }
    ],

    "first-aid": [
      {
        title: "Introduction to First Aid",
        paragraphs: [
          "First aid is the initial assistance provided to someone who is ill or injured before qualified medical care becomes available. Its aims include preserving life, preventing a condition from worsening, and supporting recovery. First aid does not replace professional assessment, diagnosis, or treatment.",
          "A first aider should remain calm, recognize the limits of their training, and consider personal safety before helping. Obtain assistance from a responsible adult or trained responder when needed. In a school or community setting, know who to contact and where approved first aid supplies are kept.",
          "Different emergencies require different responses. A conscious person with a minor problem may be able to explain what happened, while someone with severe symptoms may need immediate emergency assistance. Never assume that a person is safe simply because an injury looks small. Follow recognized first aid training and the instructions of emergency professionals."
        ],
        keyPoint: "First aid provides initial assistance, but serious illness or injury requires appropriate professional care."
      },
      {
        title: "Checking for Danger and Staying Safe",
        paragraphs: [
          "Before approaching an emergency, look for hazards that could harm you, the injured person, or bystanders. Hazards may include traffic, fire, smoke, electricity, unstable structures, chemicals, or other dangers. Do not enter an unsafe area or attempt a rescue beyond your training.",
          "If the scene is dangerous, move to a safe location and contact emergency services. Warn others away from the hazard when it is safe to do so. If the scene is safe, check whether the person responds and ask a nearby person to obtain help or first aid supplies.",
          "Use protective equipment, such as disposable gloves, when available and appropriate. Avoid unnecessary contact with blood or other body fluids. A rescuer's safety matters because becoming another casualty can make the emergency harder to manage. Follow local emergency guidance and the instructions of trained responders."
        ],
        keyPoint: "Assess the scene first, avoid hazards, use appropriate protection, and never create another casualty."
      },
      {
        title: "Calling Emergency Services",
        paragraphs: [
          "Emergency services provide trained assistance for serious injuries, sudden illness, and other urgent situations. Call the appropriate local emergency number when someone is unresponsive, has serious breathing difficulty, experiences severe bleeding, or shows other signs of a life-threatening emergency. Do not delay a necessary call while trying to manage everything alone.",
          "When calling, state your location clearly, describe what happened, explain the person's condition, and provide the number of people who need help. Answer the operator's questions and follow instructions. If possible, arrange for someone to meet responders and guide them to the correct place.",
          "Remain on the line until the operator tells you it is appropriate to end the call. Do not hang up merely because you have shared the basic information. If the situation changes, tell the operator. Avoid crowding the injured person and protect their privacy while waiting for trained help."
        ],
        keyPoint: "Give emergency operators the location, nature of the emergency, person's condition, and any changes."
      },
      {
        title: "Recognizing Common Emergencies",
        paragraphs: [
          "Emergencies can involve breathing problems, unconsciousness, seizures, allergic reactions, injuries, sudden confusion, or severe chest discomfort. Recognizing warning signs helps people seek assistance promptly. A person who cannot respond normally or is struggling to breathe needs urgent attention.",
          "Do not try to diagnose a serious condition based only on appearance. Check what the person can tell you, observe their breathing and responsiveness, and communicate your observations to emergency professionals. If someone becomes unresponsive and is not breathing normally, contact emergency services and follow the operator's instructions for appropriate resuscitation.",
          "For a seizure, protect the person from nearby hazards without restraining them or placing anything in their mouth. After the seizure, seek appropriate help and follow trained guidance. Suspected poisoning, a severe allergic reaction, or a sudden major change in consciousness also requires urgent professional assessment."
        ],
        keyPoint: "Recognize serious warning signs, seek emergency help promptly, and follow trained instructions rather than guessing a diagnosis."
      },
      {
        title: "Understanding Severe Bleeding",
        paragraphs: [
          "Severe bleeding can become life-threatening because the body may lose blood rapidly. Warning signs include substantial ongoing bleeding, a serious wound, or symptoms such as weakness, confusion, or collapse. Treat suspected severe bleeding as an emergency and contact emergency services promptly.",
          "If it is safe, use disposable gloves or another suitable barrier. For external bleeding, trained first aid guidance commonly recommends applying firm, direct pressure with a clean dressing or cloth. Do not repeatedly lift the dressing to inspect the wound, because doing so may interfere with clot formation. Follow emergency operator instructions.",
          "Do not remove an embedded object from a wound or attempt procedures beyond your training. If blood soaks through a dressing, follow professional guidance about adding material and maintaining pressure. Keep the person as safe and comfortable as possible while awaiting help, and report any changes in their condition."
        ],
        keyPoint: "Severe bleeding requires urgent help, appropriate protection, and direct pressure when suitable and within your training."
      },
      {
        title: "Burns, Injuries, and When to Seek Help",
        paragraphs: [
          "Burns may result from heat, hot liquids, chemicals, electricity, or other sources. The appropriate response depends on the cause and severity. For a thermal burn, recognized first aid guidance generally recommends cooling the affected area under cool running water, protecting it afterward, and avoiding ice, oils, or home remedies.",
          "Chemical and electrical burns can cause serious harm even when the visible injury appears limited. Avoid contact with hazardous substances, follow emergency guidance, and obtain professional assessment. Do not apply substances to chemical injuries or attempt to neutralize chemicals unless specifically directed by qualified professionals.",
          "Seek urgent help for serious, extensive, deep, chemical, or electrical burns and injuries involving breathing difficulty, major bleeding, severe pain, or suspected fractures. Do not move someone unnecessarily if a serious neck, back, or other major injury is suspected, unless remaining there creates immediate danger. Follow the instructions of trained responders."
        ],
        keyPoint: "Use appropriate first aid for the type of injury and seek professional care for serious or uncertain cases."
      },
      {
        title: "Emergency Preparedness and First Aid Kits",
        paragraphs: [
          "Emergency preparedness means planning before an incident occurs. Schools, homes, and workplaces should know how to contact emergency services, identify safe exits, communicate important information, and locate first aid supplies. Clear responsibilities help people respond more effectively during stressful situations.",
          "A first aid kit may contain suitable dressings, sterile gauze, adhesive bandages, disposable gloves, and other approved supplies. Its contents should reflect the setting, relevant risks, and local guidance. Check expiry dates, packaging, cleanliness, and stock levels regularly, and replace used or damaged items.",
          "Preparedness also includes learning basic first aid from a recognized training provider, keeping emergency contacts accessible, and making reasonable arrangements for people with disabilities or additional needs. Do not use unfamiliar medical equipment or medicines without suitable training or authorization. Review plans after drills or incidents and correct any gaps."
        ],
        keyPoint: "Maintain appropriate supplies, learn recognized first aid procedures, and plan how to contact and guide emergency help."
      }
    ],

    "computer-skills": [
      {
        title: "Introduction to Computers",
        paragraphs: [
          "A computer is an electronic device that receives data, processes it according to instructions, stores information, and produces output. Input devices include keyboards and mice; output devices include monitors and printers. Storage devices retain files, while processors execute instructions and help perform calculations.",
          "Hardware refers to the physical components of a computer. Software consists of programs and instructions that tell the hardware what to do. An operating system manages essential functions, including files, applications, memory, and connected devices. Common applications include word processors, web browsers, spreadsheets, and presentation software.",
          "Computers are useful for learning, communication, research, record keeping, and creative work. Different devices have different capabilities, but the basic principles remain similar. Learn to identify the main components, start and shut down devices correctly, and use applications suitable for each task."
        ],
        keyPoint: "Understand the roles of hardware, software, input, processing, storage, and output."
      },
      {
        title: "Using a Keyboard and Mouse",
        paragraphs: [
          "The keyboard allows users to enter letters, numbers, symbols, and commands. Important keys include Enter, Space, Backspace, Delete, Shift, Tab, and the arrow keys. Modifier keys such as Ctrl on Windows can be combined with other keys to perform common tasks efficiently.",
          "A mouse or touchpad moves the pointer, selects items, opens files, and interacts with on-screen controls. A single click usually selects an item, while a double-click often opens it. Right-clicking typically displays a context menu, although actions can vary by application and device settings.",
          "Useful keyboard shortcuts include Ctrl+C to copy, Ctrl+V to paste, Ctrl+X to cut, Ctrl+Z to undo, and Ctrl+S to save in many Windows applications. Practise these commands in a safe document. Use a comfortable posture, avoid excessive force, and take short breaks during extended computer work."
        ],
        keyPoint: "Use common keys, pointer actions, and keyboard shortcuts accurately and comfortably."
      },
      {
        title: "Managing Files and Folders",
        paragraphs: [
          "A file stores information such as a document, image, video, or spreadsheet. A folder groups files and may contain other folders. Organizing information into a clear folder structure makes it easier to find work, prevent duplication, and maintain useful records.",
          "Use descriptive file names that indicate the content and, when useful, the date or version. Keep related work together, such as school assignments in a subject folder. Learn how to create, rename, copy, move, search for, and delete files. Before deleting anything, check that it is no longer needed.",
          "Backups protect important work if a device is lost, damaged, or affected by a technical problem. Keep copies in a secure, approved location, such as an external drive or trusted cloud storage. Avoid opening unknown files, and never store passwords or confidential personal information in unprotected documents."
        ],
        keyPoint: "Use meaningful names, organized folders, careful file operations, and secure backups."
      },
      {
        title: "Word Processing Basics",
        paragraphs: [
          "Word processing software helps users create, edit, format, and print documents. It is useful for letters, reports, assignments, meeting notes, and résumés. Common tasks include entering text, selecting paragraphs, correcting mistakes, adjusting margins, and saving work in an appropriate file format.",
          "Formatting improves readability when used consistently. Headings show structure, paragraphs separate ideas, and lists organize related points. Choose readable fonts and suitable spacing instead of decorating every section. Proofread spelling, grammar, page layout, and factual accuracy before sharing or printing a document.",
          "Save your work regularly and use descriptive file names. Learn the difference between editing an original document and creating a separate copy. When sending a final document, PDF may help preserve its layout, while an editable document format is useful when another person must revise the content."
        ],
        keyPoint: "Create clear, well-organized documents and save them in formats appropriate for their intended use."
      },
      {
        title: "Spreadsheets and Basic Calculations",
        paragraphs: [
          "A spreadsheet organizes information into rows and columns. Each box is called a cell and is identified by its column letter and row number, such as A1. Spreadsheets are useful for budgets, attendance lists, marks, inventories, and other information that benefits from calculations.",
          "Formulas calculate results from cell values. In many spreadsheet applications, =SUM(B2:B6) adds the values in cells B2 through B6, while =AVERAGE(B2:B6) calculates their mean. Formulas generally begin with an equals sign. Cell references allow calculations to update when the underlying data changes.",
          "Clear headings, consistent formats, and accurate data entry help prevent errors. Sort or filter records carefully, and verify that formulas refer to the intended cells. Use charts when they make patterns easier to understand, and remember that incorrect input can produce misleading results even when the formula itself is correct."
        ],
        keyPoint: "Organize data accurately, use formulas for calculations, and check results before relying on them."
      },
      {
        title: "Internet and Email Skills",
        paragraphs: [
          "The internet connects computers and services around the world. A web browser opens websites, while a search engine helps locate information. Search with specific keywords, compare trustworthy sources, and check publication dates. Not every page is accurate, current, or suitable for every purpose.",
          "Email allows people to exchange messages and attachments. A professional message usually has a meaningful subject, an appropriate greeting, a clear body, and a polite closing. Check recipient addresses before sending, attach the intended files, and use Reply All only when everyone in the conversation needs the response.",
          "Be careful with unexpected attachments, urgent requests for personal information, and links that lead to unfamiliar websites. Do not share passwords or verification codes by email. Respect privacy when sending messages to groups, and confirm that you have permission before sharing another person's contact details or documents."
        ],
        keyPoint: "Search critically, write clear emails, check recipients and attachments, and handle links and information cautiously."
      },
      {
        title: "Digital Safety and Responsible Technology Use",
        paragraphs: [
          "Digital safety involves protecting accounts, devices, information, and personal wellbeing. Use long, unique passwords and a password manager where appropriate. Enable multifactor authentication when available, install updates, and use trusted security tools. Never share passwords or one-time verification codes with other people.",
          "Protect personal information by limiting what you publish and checking privacy settings. Be alert to phishing messages that imitate trusted organizations to obtain information or money. Verify unusual requests through an independent, trusted channel rather than relying on the contact details in a suspicious message.",
          "Responsible technology use includes respecting copyright, avoiding harassment, communicating respectfully, and checking facts before sharing information. Log out of shared devices and avoid accessing sensitive accounts on untrusted computers. Report suspicious activity or harmful online behavior to an appropriate trusted person or service."
        ],
        keyPoint: "Protect accounts and privacy, recognize suspicious messages, and use digital services ethically."
      }
    ],

    communication: [
      {
        title: "The Communication Process",
        paragraphs: [
          "Communication is the exchange of information, ideas, feelings, or instructions between people. A sender develops a message and communicates it through a channel, such as speech, writing, gestures, or digital media. A receiver interprets the message and may provide feedback to show how it was understood.",
          "Communication can be affected by noise, distractions, language differences, unclear wording, emotions, and assumptions. For example, an incomplete instruction may cause a team member to misunderstand a task. Asking questions and summarizing important details helps identify these problems before they cause larger difficulties.",
          "Effective communication considers the purpose, audience, channel, and context. A private conversation may be appropriate for sensitive feedback, while a written notice may be better for sharing a schedule with a group. Feedback helps the sender discover whether the message was understood and whether further explanation is needed."
        ],
        keyPoint: "Understand sender, message, channel, receiver, feedback, and barriers to effective communication."
      },
      {
        title: "Verbal Communication",
        paragraphs: [
          "Verbal communication uses spoken or written words to convey meaning. Clear verbal communication depends on choosing suitable language, organizing information logically, and considering what the audience already knows. Short explanations may work well for simple instructions, while complicated topics may require examples and opportunities for questions.",
          "Tone, pace, volume, and pronunciation influence how spoken words are received. Speaking too quickly can make information difficult to follow, while an unsuitable tone may sound impatient or dismissive. Adjust your delivery to the environment without shouting unnecessarily or assuming that everyone understands specialized vocabulary.",
          "Before an important conversation, identify the main point you need to communicate. Give relevant information in a logical order, invite clarification, and confirm important decisions. In writing, use appropriate grammar, punctuation, and structure. Respectful language does not mean avoiding disagreement; it means explaining different views without insulting others."
        ],
        keyPoint: "Use clear language, suitable tone, logical organization, and respectful wording."
      },
      {
        title: "Nonverbal Communication",
        paragraphs: [
          "Nonverbal communication includes facial expressions, gestures, posture, eye contact, physical distance, and aspects of voice such as tone. These signals can support spoken words or communicate additional information. For example, nodding may show attention, while an attentive posture can help demonstrate that a conversation matters.",
          "Nonverbal signals are influenced by culture, personality, disability, personal comfort, and context. Eye contact does not mean the same thing for everyone, and a facial expression cannot reliably reveal every person's thoughts. Avoid judging someone solely by body language or assuming that one gesture has a universal meaning.",
          "Effective communicators consider verbal and nonverbal information together. Maintain a respectful distance, use gestures naturally, and pay attention to whether others appear comfortable. When meaning is unclear, ask a polite question instead of relying on assumptions. Online communication also needs care because written messages may not convey tone clearly."
        ],
        keyPoint: "Notice nonverbal signals while recognizing that their meanings depend on context and individual differences."
      },
      {
        title: "Active Listening",
        paragraphs: [
          "Active listening means making a deliberate effort to understand another person's message. It involves paying attention, avoiding unnecessary interruptions, noticing the main ideas, and asking relevant questions. Listening differs from simply hearing words because it requires interpretation and a willingness to understand the speaker's perspective.",
          "Useful techniques include paraphrasing, clarifying, and summarizing. For example, 'If I understand correctly, the meeting has moved to Friday' checks whether you have interpreted the information accurately. Open questions such as 'What difficulty did you encounter?' encourage explanation rather than a simple yes-or-no answer.",
          "Good listeners avoid preparing a response while ignoring the speaker, making premature judgments, or changing the topic unnecessarily. They respect appropriate confidentiality and acknowledge feelings without pretending to know exactly what another person experiences. In a group discussion, listening carefully often reveals common interests and helps prevent avoidable disagreement."
        ],
        keyPoint: "Concentrate, ask clarifying questions, paraphrase key ideas, and respond after understanding the message."
      },
      {
        title: "Public Speaking Basics",
        paragraphs: [
          "Public speaking involves presenting information or ideas to an audience. A successful presentation begins with a clear purpose: to inform, explain, persuade, or inspire. Consider the audience's knowledge and interests, then select a manageable number of main points that support your purpose.",
          "Organize a speech with an introduction, a body, and a conclusion. The introduction identifies the topic and attracts attention; the body explains the main points with examples or evidence; and the conclusion reinforces the central message. Visual aids should support the explanation rather than replace the speaker or overwhelm the audience.",
          "Prepare notes, practise aloud, and check the time available. Speak clearly, pause between important ideas, and use readable slides if needed. Nervousness is common and often becomes easier to manage with preparation. If you lose your place, consult your notes and continue calmly. Invite questions and respond honestly when you do not know an answer."
        ],
        keyPoint: "Plan a clear structure, practise delivery, use helpful evidence, and engage respectfully with the audience."
      },
      {
        title: "Giving and Receiving Feedback",
        paragraphs: [
          "Feedback provides information about performance, behavior, or a piece of work. Constructive feedback identifies what is working, what needs improvement, and what action could help. It should be specific, respectful, timely, and connected to a clear objective rather than used to embarrass or attack someone.",
          "For example, instead of saying 'Your presentation was bad,' explain, 'The main ideas were useful, but adding examples would make the explanation easier to understand.' This identifies a strength, describes a specific improvement, and gives the person a practical direction. Focus on observable behavior rather than making broad judgments about character.",
          "Receiving feedback requires listening, asking questions when necessary, and considering whether the advice is useful. You do not have to accept every opinion automatically, but you should evaluate it fairly. Agree on realistic next steps and review progress later. Feedback works best as a two-way process that supports learning and improvement."
        ],
        keyPoint: "Give specific, respectful, actionable feedback and evaluate suggestions thoughtfully when receiving it."
      },
      {
        title: "Respectful Communication Across Differences",
        paragraphs: [
          "People differ in language, culture, age, experience, beliefs, abilities, and communication preferences. Respectful communication recognizes these differences without treating anyone as less valuable. It avoids stereotypes and gives people a fair opportunity to express their views and participate in discussions.",
          "Choose words that are understandable and appropriate for the audience. Explain unfamiliar terms, avoid mocking accents or mistakes, and ask respectful questions when cultural expectations are unclear. When communicating across languages, use straightforward sentences and confirm important details rather than assuming that silence means agreement.",
          "Disagreement can be handled respectfully by separating a person's worth from the idea being discussed. Listen to the reasoning, explain your own view with evidence, and look for areas of agreement where possible. Bullying, discrimination, threats, or harassment should not be dismissed as ordinary disagreement; seek appropriate support when someone's safety or dignity is at risk."
        ],
        keyPoint: "Communicate inclusively, challenge ideas without demeaning people, and respond appropriately to discrimination or harassment."
      }
    ],

    "financial-literacy": [
      {
        title: "Understanding Money",
        paragraphs: [
          "Money is commonly used to pay for goods and services, measure prices, and store purchasing power for future use. People may receive money through wages, business income, allowances, gifts, or other lawful sources. Understanding how money moves helps people plan their spending and make informed financial decisions.",
          "Prices reflect the amount charged for goods or services, but the lowest price is not always the best value. Consider quality, usefulness, durability, and other costs. Inflation means that the general price level rises over time, reducing the amount of goods or services a given amount of money can purchase.",
          "Financial literacy involves understanding income, expenses, saving, borrowing, risk, and financial goals. Financial decisions depend on personal circumstances, available resources, and responsibilities. Comparing options carefully and keeping accurate records helps people use money purposefully rather than making decisions only from pressure or impulse."
        ],
        keyPoint: "Understand money's uses, compare value carefully, and consider how prices and purchasing power affect decisions."
      },
      {
        title: "Needs Versus Wants",
        paragraphs: [
          "Needs are essential for basic wellbeing, safety, or important responsibilities. Wants are things that may improve comfort or enjoyment but are not immediately essential. The distinction depends partly on circumstances: transport may be necessary for school or work, while a more expensive transport option may simply be a preference.",
          "Limited resources require prioritization. Before spending, consider whether the item is necessary now, whether a suitable lower-cost alternative exists, and what other goals could be affected. Advertising, social pressure, and temporary excitement can make optional purchases feel essential even when they are not.",
          "A useful spending decision balances essential needs, reasonable enjoyment, obligations, and future goals. Making a list before shopping can help prevent unplanned purchases. Needs and wants are not identical for every person, so evaluate decisions according to real circumstances rather than judging people by their spending choices."
        ],
        keyPoint: "Prioritize essential needs, recognize optional wants, and compare purchases against available resources and goals."
      },
      {
        title: "Creating a Simple Budget",
        paragraphs: [
          "A budget is a plan for how money will be received, used, and saved over a period. It helps people compare expected income with expected expenses, prepare for obligations, and identify where adjustments may be needed. A budget can cover a week, a month, a school term, or another useful period.",
          "Start by recording expected income and listing expenses such as transport, food, school materials, communication, and other responsibilities. Separate fixed expenses from costs that vary. Then assign realistic amounts to priorities and savings where possible. Total planned spending should not exceed available resources without a clear, responsible plan.",
          "Review the budget against actual spending and adjust it when circumstances change. If costs are higher than expected, identify which optional expenses can be reduced without neglecting essential needs. A budget is a flexible planning tool, not a guarantee that unexpected expenses will never occur."
        ],
        keyPoint: "Record income, estimate expenses, plan priorities, and compare actual spending with your budget."
      },
      {
        title: "Saving and Setting Goals",
        paragraphs: [
          "Saving means keeping part of available money for future use instead of spending it immediately. Savings can support goals such as educational materials, transport, a planned purchase, or unexpected costs. Even small, regular contributions can build a useful habit when they fit within a person's circumstances.",
          "A useful savings goal is specific and realistic. Identify what the money is for, the amount required, and the time available. If a goal costs 12,000 Rwandan francs and you can safely set aside 2,000 francs each week, reaching the target would take six weeks, assuming no withdrawals or changes in the plan.",
          "Choose an appropriate, secure way to keep savings and understand any fees, access restrictions, or risks. Review progress regularly and adjust the plan when necessary. Avoid promises of guaranteed high returns, and never feel pressured to give money to an unfamiliar person claiming to offer a special savings opportunity."
        ],
        keyPoint: "Set realistic savings targets, contribute consistently when possible, and keep money in a suitable secure place."
      },
      {
        title: "Understanding Income and Expenses",
        paragraphs: [
          "Income is money received, while expenses are the costs of goods, services, and obligations. Income may come from employment, self-employment, a business, or other legitimate sources. Expenses may include essentials, transport, learning materials, household responsibilities, and optional activities.",
          "Tracking income and expenses reveals patterns that are difficult to notice from memory alone. A simple record can include the date, description, amount received or spent, and category. Comparing these records over time helps identify repeated costs, unexpected changes, and opportunities to plan more effectively.",
          "The difference between income and expenses shows whether a person has money remaining or faces a shortfall during a period. A shortfall may require reviewing costs, adjusting plans, or seeking appropriate support. Records should be accurate, kept securely, and used to guide decisions rather than to make unrealistic assumptions about future income."
        ],
        keyPoint: "Track money received and spent, categorize transactions, and use the difference to improve planning."
      },
      {
        title: "Responsible Borrowing and Debt Awareness",
        paragraphs: [
          "Borrowing means receiving money or resources that must be repaid under agreed conditions. Debt can help meet certain needs, but repayment obligations can create difficulties if the cost or timing is misunderstood. Before borrowing, identify the purpose, total amount to repay, interest, fees, due dates, and consequences of late payment.",
          "Interest is the cost of borrowing or the return earned on certain savings. A loan's total cost may include fees in addition to interest. A small regular repayment can still be difficult to manage if income is uncertain or essential expenses are already high. Compare the full repayment amount rather than focusing only on the advertised installment.",
          "Avoid borrowing because of pressure, unclear promises, or a desire to match other people's spending. Never sign an agreement you do not understand. For significant financial commitments, seek guidance from a trusted, qualified adult or appropriate financial professional. Borrowing decisions should consider realistic repayment ability and the risks of unexpected changes."
        ],
        keyPoint: "Understand the full repayment cost, read conditions carefully, and assess whether repayments are realistic."
      },
      {
        title: "Avoiding Financial Scams",
        paragraphs: [
          "Financial scams use deception to persuade people to send money, reveal confidential information, or provide access to accounts. Warning signs may include guaranteed high returns, urgent demands, secret offers, unexpected prizes, suspicious links, and requests for passwords or verification codes.",
          "Scammers may pretend to represent a bank, employer, government office, delivery service, or trusted acquaintance. Check unexpected claims using an official contact method that you locate independently. Do not rely only on a phone number or link supplied in a suspicious message, and never share a one-time security code to prove your identity to an unknown caller.",
          "If an offer seems suspicious, stop and ask a trusted person for advice before sending money. Keep evidence of suspicious messages and report them through appropriate official channels. If you believe an account or payment has been compromised, contact the relevant provider promptly using its verified contact information."
        ],
        keyPoint: "Question unrealistic promises, verify identities independently, protect account details, and report suspected fraud."
      }
    ],

    "career-readiness": [
      {
        title: "Discovering Your Strengths",
        paragraphs: [
          "Career readiness begins with understanding your interests, abilities, values, and areas for improvement. Strengths may include explaining ideas, organizing tasks, solving problems, working with people, using technology, or learning new skills. Interests describe activities that attract your attention, while values describe what matters to you in work and life.",
          "Use evidence rather than assumptions to identify strengths. Review school projects, responsibilities, volunteer activities, hobbies, and feedback from people who know your work. For example, repeatedly organizing group activities may suggest planning and coordination skills. A single mistake does not define your ability; skills can develop with practice.",
          "Compare your strengths and interests with possible educational pathways and occupations. Research the tasks, training, working conditions, and skills associated with each option. Keep an open mind: discovering a weakness can help you choose a learning goal, while discovering a new interest may reveal an opportunity you had not previously considered."
        ],
        keyPoint: "Identify strengths using real examples, recognize development needs, and explore careers that fit your interests and values."
      },
      {
        title: "Setting Personal and Career Goals",
        paragraphs: [
          "Goals give direction to learning and career development. A goal may focus on completing a course, improving a skill, preparing an application, or exploring an occupation. Clear goals make it easier to decide which activities deserve attention and how progress will be measured.",
          "A useful goal is specific, measurable, achievable, relevant, and time-bound. Instead of saying 'I will improve my computer skills,' you could aim to complete a spreadsheet practice project by the end of the month. Break larger goals into smaller tasks, assign realistic deadlines, and identify any resources or support you need.",
          "Review progress regularly and revise plans when circumstances change. Some goals depend on opportunities outside your control, so focus on actions you can take, such as practising, researching requirements, or seeking feedback. Learning from setbacks helps you adjust your approach without assuming that one unsuccessful attempt determines your future."
        ],
        keyPoint: "Set clear, realistic goals, divide them into actions, track progress, and adjust plans when needed."
      },
      {
        title: "Preparing a CV or Résumé",
        paragraphs: [
          "A CV or résumé summarizes a person's education, skills, experience, achievements, and relevant activities for an application. Requirements vary by country, employer, and opportunity, so read the instructions before preparing the document. A strong application is accurate, easy to read, and tailored to the role.",
          "Common sections include contact information, a short profile when useful, education, relevant skills, experience, projects, volunteering, and achievements. People with limited work experience can include school responsibilities, community activities, practical projects, and transferable skills. Describe what you actually did rather than inventing a job title or qualification.",
          "Use clear headings, consistent formatting, concise bullet points, and correct spelling. Emphasize evidence relevant to the opportunity. For example, describe organizing a school event by explaining the responsibility and outcome. Check dates, contact details, and file format before sending, and avoid including unnecessary sensitive personal information."
        ],
        keyPoint: "Present accurate, relevant qualifications and experience in a clear, readable, tailored document."
      },
      {
        title: "Writing a Professional Application",
        paragraphs: [
          "A professional application explains why you are applying and how your qualifications relate to an opportunity. Before writing, study the advertisement or instructions, identify required qualifications, and gather accurate information about the organization. Follow the requested format, deadline, and submission method.",
          "A formal application letter or email usually identifies the opportunity, introduces the applicant, explains relevant skills and evidence, and closes politely. Use a suitable greeting and subject line, organized paragraphs, and professional language. Connect your abilities to the actual requirements instead of relying on general claims such as 'I am the best candidate.'",
          "Proofread carefully, confirm that required documents are attached, and check the recipient's details. Do not exaggerate qualifications or include false references. Keep a copy of what you submitted and record the date. If follow-up is appropriate, communicate politely and allow a reasonable amount of time for the organization to respond."
        ],
        keyPoint: "Follow application instructions, connect your evidence to the requirements, and submit an accurate, professional application."
      },
      {
        title: "Interview Preparation",
        paragraphs: [
          "An interview allows an organization to learn about an applicant's experience, skills, motivation, and suitability. Preparation begins by understanding the role and researching the organization using reliable sources. Review the application you submitted and identify examples that demonstrate relevant abilities.",
          "Practise explaining your strengths, learning experiences, achievements, and reasons for applying. The STAR method can help structure examples: describe the Situation, Task, Action you took, and Result. Choose truthful examples from employment, school, volunteering, projects, or other relevant activities.",
          "Plan appropriate clothing, travel or connection arrangements, and arrival time. Listen carefully to each question, answer directly, and ask for clarification if needed. Be honest when you do not know something and explain how you would learn or find the answer. After the interview, reflect on what went well and what you could improve."
        ],
        keyPoint: "Research the opportunity, practise truthful examples, communicate clearly, and prepare practical arrangements."
      },
      {
        title: "Workplace Ethics and Reliability",
        paragraphs: [
          "Workplace ethics are principles that guide responsible behavior at work. They include honesty, respect, fairness, confidentiality, accountability, and compliance with appropriate rules. Ethical employees report information accurately, use resources responsibly, and avoid discrimination, harassment, or misuse of their position.",
          "Reliability means that others can reasonably depend on you to meet agreed responsibilities. This includes arriving as agreed, completing tasks carefully, communicating delays early, and asking for help when instructions are unclear. If a mistake occurs, explain it honestly and take appropriate steps to correct it instead of hiding the problem.",
          "Professional conduct also involves respecting colleagues, protecting confidential information, accepting constructive feedback, and maintaining suitable boundaries. Rules vary between workplaces, so learn the relevant policies and seek guidance when uncertain. Report serious safety, misconduct, or safeguarding concerns through appropriate channels rather than ignoring risks."
        ],
        keyPoint: "Act honestly, respect others, protect confidential information, and take responsibility for your work."
      },
      {
        title: "Continuous Learning and Career Growth",
        paragraphs: [
          "Continuous learning means developing knowledge and skills throughout life. Technology, workplace practices, and community needs change over time, so people often need to update their abilities. Learning may occur through formal education, short courses, supervised practice, reading, mentoring, or experience in projects.",
          "Begin by identifying the skills required for your goals and comparing them with your current abilities. Create a practical development plan with learning activities, deadlines, and evidence of progress. Feedback from teachers, mentors, supervisors, and colleagues can help identify gaps and suggest useful next steps.",
          "Career growth does not always follow a straight path. New responsibilities, changing interests, and unexpected opportunities may require a revised plan. Keep records of completed training and meaningful achievements, reflect on lessons learned, and seek trustworthy opportunities to practise new skills. Stay cautious of training or employment offers that require suspicious payments or promise guaranteed success."
        ],
        keyPoint: "Keep learning, seek useful feedback, practise new skills, and adapt your career plan as opportunities change."
      }
    ]
  };

  const courseLessons = lessons[course.slug];

  if (courseLessons && courseLessons[index]) {
    return courseLessons[index];
  }

  // Safe fallback for any future course or topic.
  return {
    title: course.topics[index] || course.title,
    paragraphs: [
      `${course.topics[index]} is an important part of ${course.title}. Understanding this topic helps learners develop useful knowledge and apply it in education, daily life, and work.`,
      "Study the main concepts carefully, identify important terms, and connect the ideas to practical examples. Compare reliable information, ask questions when something is unclear, and explain the topic in your own words.",
      "Review what you have learned, practise applying the concepts, and identify areas that need more attention. Use feedback and further study to strengthen your understanding before moving to the next lesson."
    ],
    keyPoint: `Understand the main concepts of ${course.topics[index]} and practise applying them in real situations.`
  };
}
const learnLoopCourses = [
  {
    slug: "leadership",
    title: "Leadership",
    description: "Build responsibility, teamwork, decision-making, and leadership skills.",
    icon: "👥",
    topics: [
      "Understanding Leadership",
      "Qualities of a Good Leader",
      "Communication and Active Listening",
      "Teamwork and Collaboration",
      "Decision-Making and Problem-Solving",
      "Managing Conflict and Disagreement",
      "Ethics, Responsibility, and Leading by Example"
    ]
  },
  {
    slug: "first-aid",
    title: "First Aid Awareness",
    description: "Learn basic emergency awareness and how to seek appropriate help.",
    icon: "🩺",
    topics: [
      "Introduction to First Aid",
      "Checking for Danger and Staying Safe",
      "Calling Emergency Services",
      "Recognizing Common Emergencies",
      "Understanding Severe Bleeding",
      "Burns, Injuries, and When to Seek Help",
      "Emergency Preparedness and First Aid Kits"
    ]
  },
  {
    slug: "english",
    title: "English Communication",
    description: "Improve grammar, vocabulary, reading, writing, and speaking.",
    icon: "📘",
    topics: [
      "Parts of Speech",
      "Building Correct Sentences",
      "Essential Grammar",
      "Vocabulary Development",
      "Reading Comprehension",
      "Writing Clear Paragraphs",
      "Speaking and Everyday Communication"
    ]
  },
  {
    slug: "computer-skills",
    title: "Computer Skills",
    description: "Develop practical digital literacy for school and work.",
    icon: "💻",
    topics: [
      "Introduction to Computers",
      "Using a Keyboard and Mouse",
      "Managing Files and Folders",
      "Word Processing Basics",
      "Spreadsheets and Basic Calculations",
      "Internet and Email Skills",
      "Digital Safety and Responsible Technology Use"
    ]
  },
  {
    slug: "communication",
    title: "Communication Skills",
    description: "Express ideas clearly and work effectively with others.",
    icon: "🗣️",
    topics: [
      "The Communication Process",
      "Verbal Communication",
      "Nonverbal Communication",
      "Active Listening",
      "Public Speaking Basics",
      "Giving and Receiving Feedback",
      "Respectful Communication Across Differences"
    ]
  },
  {
    slug: "financial-literacy",
    title: "Financial Literacy",
    description: "Understand budgeting, saving, spending, and financial decisions.",
    icon: "💰",
    topics: [
      "Understanding Money",
      "Needs Versus Wants",
      "Creating a Simple Budget",
      "Saving and Setting Goals",
      "Understanding Income and Expenses",
      "Responsible Borrowing and Debt Awareness",
      "Avoiding Financial Scams"
    ]
  },
  {
    slug: "career-readiness",
    title: "Career Readiness",
    description: "Prepare for opportunities in education, employment, and community life.",
    icon: "🎯",
    topics: [
      "Discovering Your Strengths",
      "Setting Personal and Career Goals",
      "Preparing a CV or Résumé",
      "Writing a Professional Application",
      "Interview Preparation",
      "Workplace Ethics and Reliability",
      "Continuous Learning and Career Growth"
    ]
  }
];


const academyLeadershipLessons = [
  {
    title: "Understanding Leadership",
    paragraphs: [
      "Leadership is the ability to guide, support, motivate, and encourage people toward a shared goal. A leader helps a group understand what needs to be achieved, organizes activities, and supports members as they work together. Leadership is not simply about having a title or giving instructions. It is about taking responsibility, serving others, and helping people contribute their abilities.",
      "Leadership can be practiced in many places, including schools, families, community organizations, workplaces, and sports teams. A student demonstrates leadership by organizing a group assignment, helping classmates understand a difficult topic, encouraging participation, or taking responsibility for completing an agreed task. These everyday actions can make a positive difference even when the student has no official leadership position.",
      "Different situations require different leadership approaches. Sometimes a leader must make a timely decision. At other times, the leader should ask questions, listen to the group, and allow members to suggest solutions. Effective leaders consider the task, the experience of the team, and the needs of the people involved before deciding how to act.",
      "Leadership also requires continuous learning. A leader may make an incorrect decision or discover that a plan is not working. Instead of hiding the mistake or blaming others, a responsible leader examines what happened, listens to feedback, corrects the problem, and applies the lesson to future situations. This attitude encourages trust and improvement.",
      "For example, imagine that a school group must prepare a presentation within three days. A student leader helps the group understand the assignment, divides tasks fairly, agrees on deadlines, checks progress, and offers assistance when someone experiences difficulty. The leader does not do every task alone or take all the credit. The group succeeds because members understand their responsibilities and work toward the same objective."
    ],
    keyPoint: "Leadership is responsible service: helping people work together, achieve shared goals, and improve through experience."
  },
  {
    title: "Qualities of a Good Leader",
    paragraphs: [
      "Good leaders develop qualities that help people trust and cooperate with them. Important qualities include honesty, responsibility, respect, fairness, patience, courage, empathy, and reliability. No leader demonstrates every quality perfectly at all times. The important thing is to practice these qualities consistently and accept responsibility when improvement is needed.",
      "Honesty means communicating truthfully, presenting information accurately, and admitting mistakes. A leader who makes a promise should make a genuine effort to fulfill it or explain promptly when circumstances prevent it. Dishonesty may produce short-term advantages, but it damages trust and makes teamwork more difficult.",
      "Responsibility means understanding one's duties and accepting the consequences of one's decisions. A responsible student leader attends meetings, completes assigned work, keeps useful records, and follows agreed rules. If a deadline is missed, the leader explains the situation and helps the group develop a practical recovery plan instead of unfairly blaming another member.",
      "Fairness and respect require treating people with dignity, regardless of their background, abilities, opinions, or social position. A fair leader gives members reasonable opportunities to participate and considers evidence before making judgments. Empathy helps the leader understand how others may feel, while patience allows people time to learn, ask questions, and correct mistakes.",
      "A good leader is also willing to learn. Feedback from classmates, teachers, colleagues, and community members can reveal weaknesses that the leader may not notice alone. Rather than viewing every suggestion as an attack, an effective leader considers whether the feedback is useful and makes changes when appropriate. Courage is equally important because some responsible decisions require speaking up against unfair treatment or admitting an unpopular truth."
    ],
    keyPoint: "Trustworthy leadership grows from honesty, fairness, responsibility, empathy, courage, and a willingness to learn."
  },
  {
    title: "Communication and Active Listening",
    paragraphs: [
      "Communication is the process of sharing information, ideas, instructions, and feelings. It includes speaking, writing, listening, observing body language, and asking questions. Good communication helps a team understand its goals, coordinate activities, prevent misunderstandings, and address problems before they become more serious.",
      "Effective leaders communicate clearly and respectfully. They explain what needs to be done, why it matters, who is responsible, and when the work should be completed. They choose language appropriate to their audience and avoid unnecessary insults, confusing instructions, or assumptions that everyone already understands the task. Important decisions and deadlines should be recorded when appropriate.",
      "Active listening means concentrating on the speaker to understand the message rather than simply waiting for an opportunity to respond. A good listener avoids unnecessary interruptions, pays attention to the speaker's main ideas, asks clarifying questions, and summarizes important points. For example, a student might say, 'If I understand correctly, you are concerned that we have too little time to finish the research. Is that right?' This gives the speaker an opportunity to confirm or correct the understanding.",
      "Nonverbal communication also matters. Facial expressions, posture, gestures, and tone of voice can affect how a message is understood. However, these signals do not always reveal exactly what a person thinks or feels. Leaders should avoid making quick assumptions and should ask respectful questions when a message is unclear.",
      "Constructive feedback focuses on specific behavior and practical improvement rather than attacking someone's character. Instead of saying, 'You are careless,' a leader might explain, 'The report was submitted without the required references. Let's review the instructions together before the next submission.' This approach identifies the problem and offers a way forward without humiliating the person.",
      "Communication is especially important when people disagree. A leader should allow participants to explain their views, distinguish facts from assumptions, summarize the points of disagreement, and help the group identify possible solutions. Confidential information should be shared only with people who have a legitimate reason to receive it."
    ],
    keyPoint: "Listen to understand, communicate clearly, ask respectful questions, and give feedback that helps people improve."
  },
  {
    title: "Teamwork and Collaboration",
    paragraphs: [
      "Teamwork is the cooperation of two or more people who combine their knowledge, skills, time, and effort to achieve a shared objective. Collaboration is more than placing people in the same group. Members must communicate, coordinate their activities, respect one another, and accept shared responsibility for the final result.",
      "Successful teamwork begins with a clear goal. Every member should understand what the group must accomplish, the expected standard of work, the available resources, and the deadline. The team can then divide a large task into smaller responsibilities. Duties should be allocated fairly according to members' abilities, interests, availability, and opportunities to develop new skills.",
      "Different people contribute different strengths. One student may be good at research, another at writing, and another at explaining information during a presentation. A strong team values these differences and gives everyone a meaningful opportunity to participate. Members who are less experienced should receive guidance rather than being excluded from important tasks.",
      "Accountability helps the team remain organized. Members should agree on deadlines, report progress honestly, and inform the group early if they face difficulties. Short progress meetings can identify delays and allow responsibilities to be adjusted. A leader should monitor the overall task without controlling every small action or preventing members from using their initiative.",
      "Disagreements can occur because members have different ideas or expectations. The team should return to its shared objective, compare suggestions using evidence, and agree on a fair decision-making process. If a member repeatedly fails to complete agreed responsibilities, the group should discuss the issue privately and constructively, clarify expectations, and seek appropriate guidance if needed.",
      "For example, when preparing a community health presentation, one member might research prevention, another prepare visual materials, another organize the presentation, and another check the accuracy of the information. The team should review the final work together so that every section supports the same message. Afterward, members can discuss what worked well and what they would improve next time."
    ],
    keyPoint: "Strong teams set clear goals, divide work fairly, communicate regularly, respect differences, and share responsibility for results."
  },
  {
    title: "Decision-Making and Problem-Solving",
    paragraphs: [
      "Decision-making is the process of choosing among possible actions, while problem-solving involves identifying a difficulty and developing an effective response. Leaders use both skills when organizing activities, resolving disagreements, managing limited resources, and responding to unexpected changes. Good decisions are not based only on personal preference; they consider relevant information, possible consequences, and the people affected.",
      "The first step is to define the problem accurately. A group that says, 'Our project is failing,' may need to identify the actual cause: unclear duties, insufficient materials, poor communication, or unrealistic deadlines. A clear problem statement helps prevent the team from spending time on symptoms without addressing the underlying issue.",
      "Next, gather reliable information. This may involve checking instructions, reviewing records, consulting knowledgeable people, observing what is happening, or asking those affected for their views. Leaders should distinguish confirmed facts from assumptions and recognize when information is incomplete. When a decision involves health, safety, money, or important rights, qualified guidance may be necessary.",
      "After understanding the problem, develop several possible solutions. Compare them according to their expected benefits, costs, risks, fairness, time requirements, available resources, and long-term effects. A simple decision table can help a team compare options systematically. The cheapest or fastest option is not automatically the best if it creates greater risks or harms other people.",
      "Once an option is selected, prepare an action plan. Identify who will do each task, what resources are needed, when activities should happen, and how progress will be measured. Communicate the decision to relevant people and explain the main reasons. For urgent situations, leaders may need to act quickly, but they should still follow safety procedures and applicable rules.",
      "Finally, evaluate the outcome. Did the solution address the original problem? Were the expected results achieved? Did new difficulties appear? If the solution was ineffective, examine why and adjust the plan. For example, if a study group performs poorly because meetings are irregular, members might establish a weekly schedule, assign preparation tasks, and review progress after two weeks."
    ],
    keyPoint: "Define the problem, gather reliable information, compare solutions, take responsible action, and evaluate the outcome."
  },
  {
    title: "Managing Conflict and Disagreement",
    paragraphs: [
      "Conflict occurs when people have different needs, opinions, expectations, interests, or interpretations of a situation. It is a normal part of working with others and does not always indicate that a team is failing. When handled respectfully, disagreement can reveal overlooked problems, improve decisions, and help people understand different perspectives.",
      "Conflict becomes more difficult when people make accusations, interrupt one another, spread rumors, or respond while extremely upset. A responsible leader should encourage participants to pause when necessary, speak respectfully, and focus on the issue rather than attacking a person's character. Everyone should have a reasonable opportunity to explain what happened and how the situation affects them.",
      "A practical conflict-resolution process begins by identifying the specific disagreement. Each person explains their concerns without unnecessary interruption. The participants then clarify the facts, identify shared interests, and separate essential needs from personal preferences. Asking questions such as 'What outcome would be fair to everyone?' can help move the discussion from blame toward solutions.",
      "Possible solutions should be considered openly. The people involved might agree to divide responsibilities differently, clarify expectations, correct inaccurate information, establish new communication rules, or ask a neutral person to help. Any agreement should specify what each person will do and when the arrangement will be reviewed. A solution is more likely to last when participants understand and accept their responsibilities.",
      "Not every conflict can or should be resolved through direct discussion. Bullying, threats, harassment, discrimination, violence, or serious safety concerns require appropriate support from a trusted teacher, school administrator, supervisor, safeguarding officer, or other responsible authority. A person should not be pressured to confront someone directly when doing so could place them at risk.",
      "After resolving a disagreement, the group should review what caused it and how similar problems might be prevented. Clear duties, realistic deadlines, transparent decisions, and respectful communication can reduce repeated misunderstandings. Leaders should also protect appropriate confidentiality and avoid sharing personal details with people who do not need them."
    ],
    keyPoint: "Resolve ordinary disagreements through respectful listening, clear facts, fair solutions, and agreed actions; seek help when safety or dignity is at risk."
  },
  {
    title: "Ethics, Responsibility, and Leading by Example",
    paragraphs: [
      "Ethical leadership means making decisions according to principles such as honesty, fairness, respect, accountability, and concern for other people. An ethical leader considers not only whether an action is permitted but also whether it is responsible, transparent, and likely to cause unnecessary harm. Personal convenience or the desire to gain recognition should not take priority over the group's legitimate interests.",
      "Integrity means that a person's actions are consistent with the values they claim to follow. A student leader who expects classmates to arrive on time should also make a reasonable effort to be punctual. A leader who asks others to acknowledge their mistakes should be willing to do the same. Leading by example makes expectations more credible because people can observe the behavior directly.",
      "Accountability requires accepting responsibility for decisions and their consequences. Leaders should explain important decisions, keep accurate records where necessary, correct mistakes, and cooperate with appropriate reviews. If a leader uses group resources incorrectly or provides inaccurate information, the responsible response is to acknowledge the problem and take practical steps to correct it.",
      "Ethical leaders protect people's dignity, privacy, and legitimate interests. They should not share confidential information without a proper reason, favor friends unfairly, misuse authority, or take credit for work completed by others. When a leader has a personal interest that could affect a decision, that conflict should be disclosed and handled according to the relevant rules.",
      "Responsibility also includes using resources carefully. Time, money, materials, equipment, and information should be managed for their intended purposes. Leaders should follow applicable school, workplace, community, and legal requirements. When they lack the knowledge or authority to make an important decision, they should consult a qualified or authorized person instead of pretending to know everything.",
      "Ethical leadership requires courage because doing the right thing may be inconvenient or unpopular. A leader may need to correct false information, challenge an unfair decision respectfully, or report serious misconduct through appropriate channels. Courage should be combined with good judgment: concerns should be communicated responsibly, evidence should be handled carefully, and people should not be accused without a reasonable basis.",
      "To develop ethical leadership, reflect regularly on questions such as: Was my decision fair? Did I listen to the people affected? Did I explain my reasons honestly? Did I protect confidential information? What should I do differently next time? These questions encourage continuous improvement and help leaders build a reputation based on responsible conduct."
    ],
    keyPoint: "Ethical leaders act with integrity, accept accountability, protect others' dignity, use resources responsibly, and demonstrate the values they expect from their team."
  }
];

const ACADEMY_PROGRESS_KEY = "learnloop_academy_read_topics_v1";

function getAcademyProgress() {
  try {
    return JSON.parse(
      localStorage.getItem(ACADEMY_PROGRESS_KEY) || "{}"
    );
  } catch {
    return {};
  }
}

function saveAcademyProgress(progress) {
  localStorage.setItem(
    ACADEMY_PROGRESS_KEY,
    JSON.stringify(progress)
  );
}

function academyCourseIsComplete(course, progress) {
  const readTopics = progress[course.slug] || [];
  return course.topics.every((_, index) =>
    readTopics.includes(index)
  );
}

function renderAcademyCourses() {
  const grid = document.querySelector("#academyCourseGrid");
  if (!grid) return;

  const progress = getAcademyProgress();
  grid.replaceChildren();

  learnLoopCourses.forEach((course, index) => {
    const previousCourse = learnLoopCourses[index - 1];

    const unlocked =
      index === 0 ||
      academyCourseIsComplete(previousCourse, progress);

    const readTopics = progress[course.slug] || [];
    const completed = academyCourseIsComplete(course, progress);

    const card = document.createElement("article");
    card.className = "academy-course-card";

    const icon = document.createElement("div");
    icon.className = "academy-course-icon";
    icon.textContent = unlocked ? course.icon : "🔒";

    const title = document.createElement("h3");
    title.textContent = course.title;

    const description = document.createElement("p");
    description.textContent = unlocked
      ? course.description
      : "Complete the previous course to unlock this course.";

    const count = document.createElement("span");
    count.className = "academy-topic-count";
    count.textContent = unlocked
      ? `${readTopics.length} of ${course.topics.length} topics read`
      : "Course locked";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "academy-open-course";
    button.textContent = !unlocked
      ? "Locked 🔒"
      : completed
        ? "Review course"
        : "Start learning →";
    button.disabled = !unlocked;

    button.addEventListener("click", () => {
      openAcademyCourse(course);
    });

    card.append(icon, title, description, count, button);
    grid.appendChild(card);
  });
}

function openAcademyCourse(course) {
  const panel = document.querySelector("#academyStudyPanel");
   window.currentAcademyCourse = course;
  if (!panel) return;

  const progress = getAcademyProgress();
  const readTopics = progress[course.slug] || [];

  document.querySelector("#academyCourseTitle").textContent =
    course.title;

  document.querySelector("#academyCourseDescription").textContent =
    course.description;

  const topicList = document.querySelector("#academyTopicList");
  const lessonContent = document.querySelector("#academyLessonContent");

  topicList.replaceChildren();
  lessonContent.replaceChildren();

  course.topics.forEach((topic, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "academy-topic-item";
    button.textContent =
      `${readTopics.includes(index) ? "✓ " : ""}${index + 1}. ${topic} — Open topic`;

  
button.addEventListener("click", () => {
  const lesson = getAcademyReading(course, index);

  lessonContent.replaceChildren();

  const heading = document.createElement("h4");
  heading.textContent = lesson.title;
  lessonContent.appendChild(heading);

  lesson.paragraphs.forEach(text => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    lessonContent.appendChild(paragraph);
  });

  const keyPoint = document.createElement("div");
  keyPoint.className = "academy-key-point";
  keyPoint.textContent = `Key point: ${lesson.keyPoint}`;
  lessonContent.appendChild(keyPoint);

  const reminder = document.createElement("p");
  reminder.textContent =
    "Read the lesson carefully. Before continuing, make sure you understand its main idea.";
  lessonContent.appendChild(reminder);

  const markButton = document.createElement("button");
  markButton.type = "button";
  markButton.className = "academy-open-course";
  markButton.textContent = readTopics.includes(index)
    ? "✓ Topic already marked as read"
    : "Mark topic as read";

  markButton.disabled = readTopics.includes(index);

  markButton.addEventListener("click", () => {
    const latestProgress = getAcademyProgress();
    const latestRead = latestProgress[course.slug] || [];

    if (!latestRead.includes(index)) {
      latestRead.push(index);
      latestProgress[course.slug] = latestRead;
      saveAcademyProgress(latestProgress);
    }

    openAcademyCourse(course);
    renderAcademyCourses();
  });

  lessonContent.appendChild(markButton);

  lessonContent.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

    topicList.appendChild(button);
  });

  const total = course.topics.length;
  const percentage = Math.round((readTopics.length / total) * 100);

  document.querySelector("#academyProgressBar").style.width =
    `${percentage}%`;

  document.querySelector("#academyProgressText").textContent =
    `${percentage}% completed — ${readTopics.length} of ${total} topics read`;

  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}
 


document.querySelector("#closeAcademyCourse")?.addEventListener("click", () => {
  document.querySelector("#academyStudyPanel")?.classList.add("hidden");
  document.querySelector("#learnLoopAcademy")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

function getDailyLessonOrder(lessons) {
  const today = new Date().toISOString().slice(0, 10);

  function hash(text) {
    let value = 0;
    for (let i = 0; i < text.length; i++) {
      value = (value * 31 + text.charCodeAt(i)) >>> 0;
    }
    return value;
  }

  return [...lessons].sort((a, b) => {
    const aKey = hash(`${today}-${a.title}`);
    const bKey = hash(`${today}-${b.title}`);
    return aKey - bKey;
  });
}
function renderFeaturedLesson() {
  const title = document.querySelector("#featuredLessonTitle");
  const description = document.querySelector("#featuredLessonDescription");
  const image = document.querySelector("#featuredLessonImage");
  const link = document.querySelector("#featuredLessonLink");

  if (!title || !description || !image || !link || !learnLoopLessons.length) {
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let hash = 0;

  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
  }

  const lesson = learnLoopLessons[hash % learnLoopLessons.length];

  title.textContent = lesson.title;
  description.textContent = lesson.description;
  image.src = lesson.image;
  image.alt = lesson.title;
  link.href = lesson.link;
}
function renderLessonCards() {
   renderAcademyCourses();
  renderFeaturedLesson(); 
  const grid = document.querySelector("#lessonGrid");
  const count = document.querySelector("#lessonCount");
  const moreButton = document.querySelector("#loadMoreLessons");

  if (!grid) return;

  const subject = document.querySelector("#lessonSubject")?.value || "All";
  const search = document.querySelector("#lessonSearch")?.value.trim().toLowerCase() || "";

  const filtered = learnLoopLessons.filter(lesson => {
    const matchesSubject = subject === "All" || lesson.subject === subject;
    const matchesSearch = `${lesson.title} ${lesson.description} ${lesson.subject}`
      .toLowerCase()
      .includes(search);

    return matchesSubject && matchesSearch;
  });
const visible = getDailyLessonOrder(filtered);
  

  grid.replaceChildren();

  visible.forEach(lesson => {
    const card = document.createElement("article");
    card.className = "discover-card";

    const image = document.createElement("img");
    image.className = "discover-image";
    image.src = lesson.image;
    image.alt = lesson.title;
    image.loading = "lazy";

    const content = document.createElement("div");
    content.className = "discover-card-content";

    const tag = document.createElement("span");
    tag.className = "discover-tag";
    tag.textContent = lesson.subject.toUpperCase();

    const heading = document.createElement("h3");
    heading.textContent = lesson.title;

    const description = document.createElement("p");
    description.textContent = lesson.description;

    const link = document.createElement("a");
    link.href = lesson.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Explore lesson →";

    content.append(tag, heading, description, link);
    card.append(image, content);
    grid.append(card);
  });

  if (count) {
    count.textContent = `Showing ${visible.length} of ${filtered.length} lessons`;
  }
if (moreButton) {
  moreButton.hidden = true;
}

}

function bindEvents() {


  // LearnLoop YouTube search and subject buttons
  const youtubeForm = document.querySelector("#youtubeSearchForm");
  const youtubeButton = document.querySelector("#youtubeSearchButton");
  const youtubeInput = document.querySelector("#youtubeSearchInput");

  if (youtubeForm && !youtubeForm.dataset.connected) {
    youtubeForm.dataset.connected = "true";

    youtubeForm.addEventListener("submit", event => {
      event.preventDefault();
      searchYouTubeVideos();
    });
  } else if (youtubeButton && !youtubeForm) {
    youtubeButton.addEventListener("click", event => {
      event.preventDefault();
      searchYouTubeVideos();
    });
  }

  document.querySelectorAll("[data-youtube-query]").forEach(button => {
    if (button.dataset.connected) return;
    button.dataset.connected = "true";

    button.addEventListener("click", () => {
      if (!youtubeInput) return;
      youtubeInput.value = button.dataset.youtubeQuery || "";
      searchYouTubeVideos();
    });
  });


  // LearnLoop lesson library controls
  const lessonSearch = document.querySelector("#lessonSearch");
  const lessonSubject = document.querySelector("#lessonSubject");
  const loadMoreLessons = document.querySelector("#loadMoreLessons");

  if (lessonSearch && !lessonSearch.dataset.connected) {
    lessonSearch.dataset.connected = "true";
    lessonSearch.addEventListener("input", () => {
      visibleLessonCount = 12;
      renderLessonCards();
    });
  }

  if (lessonSubject && !lessonSubject.dataset.connected) {
    lessonSubject.dataset.connected = "true";
    lessonSubject.addEventListener("change", () => {
      visibleLessonCount = 12;
      renderLessonCards();
    });
  }

  if (loadMoreLessons && !loadMoreLessons.dataset.connected) {
    loadMoreLessons.dataset.connected = "true";
    loadMoreLessons.addEventListener("click", () => {
      visibleLessonCount += 12;
      renderLessonCards();
    });
  }

  renderLessonCards();

 


  $("#youtubeSearchInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchYouTubeVideos();
    }
  });
 
  $$("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.view);

      if (button.dataset.view === "youtube") {
        const input = $("#youtubeSearchInput");

        if (input && !input.value.trim()) {
          input.value = "educational videos";
        }

        searchYouTubeVideos();
      }
    });
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

  $("#welcomeAuthForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("#welcomeEmail").value.trim();
    const password = $("#welcomePassword").value;
    const name = $("#welcomeName").value.trim();

    $("#authEmail").value = email;
    $("#authPassword").value = password;

   
if (state.authMode === "signup") {
  $("#authName").value = name;

  const countryCode = $("#signupPhoneCountry")?.value || "";
  const phoneNumber = $("#signupPhone")?.value.trim() || "";

  if (!name) {
    $("#welcomeAuthMessage").textContent =
      "Please enter your display name.";
    return;
  }

  if (!countryCode || !phoneNumber) {
    $("#welcomeAuthMessage").textContent =
      "Please enter your country code and phone number.";
    return;
  }

  $("#welcomeAuthMessage").textContent =
    "Your details are ready. Creating your account...";
  
  $("#authName").dataset.phoneCountry = countryCode;
  $("#authName").dataset.phoneNumber = phoneNumber;
}


    $("#welcomeAuthMessage").textContent = "Please wait...";

    await handleAuth(event);

    const authMessage = $("#authMessage")?.textContent || "";
    $("#welcomeAuthMessage").textContent = authMessage;
  });

  $("#welcomeSwitchButton")?.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "signup" : "login");
    updateWelcomeAuthMode();
  });

  $("#toggleAuthMode")?.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "signup" : "login");
  });

  $("#signOutButton")?.addEventListener("click", signOut);
   $("#newPostTop")?.addEventListener("click", () => {
  if (!state.session) {
    setAuthMode("login");
    openDialog("authDialog");
    return;
  }

  navigate("feed");

  const postText = $("#postText");
  if (postText) {
    postText.focus();
    postText.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
  $("#postForm")?.addEventListener("submit", publishPost);
   
$("#profilePicture")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  const preview = $("#profilePicturePreviewImage");
  const placeholder = $("#profilePicturePlaceholder");

  if (!file) {
    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    if (placeholder) placeholder.classList.remove("hidden");
    return;
  }

  if (!file.type.startsWith("image/")) {
    toast("Please select an image file.", "error");
    event.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    toast("Profile pictures must be 5 MB or smaller.", "error");
    event.target.value = "";
    return;
  }

  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");
  }

  if (placeholder) placeholder.classList.add("hidden");
});


  $("#messageUserSearchForm")?.addEventListener(
    "submit",
    searchMessageUsers
  );

  $("#messageUserResults")?.addEventListener("click", event => {
    const button = event.target.closest("[data-message-user]");
    if (button) startPrivateConversation(button.dataset.messageUser);
  });

  $("#conversationList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-open-conversation]");
    if (button) openPrivateConversation(button.dataset.openConversation);
  });

  $("#messageForm")?.addEventListener("submit", sendPrivateMessage);

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
   $("#appointCommitteeMember")?.addEventListener("click", appointCommitteeMember);
   $("#hostDashboardButton")?.addEventListener("click", loadCommitteeMembers);

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

/* LearnLoop post background colour selection */
document.querySelectorAll(".post-color-option").forEach(button => {
  button.addEventListener("click", () => {
    const color = button.dataset.color;
    const colorInput = document.querySelector("#postCardColor");

    if (!color || !colorInput) return;

    colorInput.value = color;

    document.querySelectorAll(".post-color-option").forEach(option => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });

    const postText = document.querySelector("#postText");
    if (postText) {
      postText.style.backgroundColor = color;
      postText.style.borderRadius = "12px";
      postText.style.padding = "12px";
    }
  });
});

const academyLeadershipQuiz = [
  {
    question: "What is the main purpose of leadership?",
    options: [
      "To control everyone",
      "To guide people toward a shared goal",
      "To avoid responsibility",
      "To make every decision alone"
    ],
    answer: 1
  },
  {
    question: "Which is a quality of a good leader?",
    options: ["Dishonesty", "Favoritism", "Fairness", "Impatience"],
    answer: 2
  },
  {
    question: "What does active listening involve?",
    options: [
      "Interrupting frequently",
      "Ignoring other opinions",
      "Paying attention and asking relevant questions",
      "Talking all the time"
    ],
    answer: 2
  },
  {
    question: "What is teamwork?",
    options: [
      "Working against others",
      "Combining skills to achieve a shared objective",
      "Giving all tasks to one person",
      "Avoiding group discussions"
    ],
    answer: 1
  },
  {
    question: "What should you do before making an important decision?",
    options: [
      "Guess without information",
      "Ignore possible risks",
      "Gather reliable information and consider options",
      "Always follow the loudest person"
    ],
    answer: 2
  },
  {
    question: "How should a leader approach a disagreement?",
    options: [
      "Listen calmly and seek a fair solution",
      "Blame someone immediately",
      "Refuse to hear other views",
      "Make the conflict worse"
    ],
    answer: 0
  },
  {
    question: "What should a leader do after making a mistake?",
    options: [
      "Hide it at all costs",
      "Blame the team",
      "Ignore its effects",
      "Accept responsibility and correct it"
    ],
    answer: 3
  },
  {
    question: "Why should a leader share credit with team members?",
    options: [
      "To discourage teamwork",
      "To recognize other people's contributions",
      "To avoid completing tasks",
      "To gain control over others"
    ],
    answer: 1
  },
  {
    question: "What is a fair way to organize team tasks?",
    options: [
      "Give every task to the same person",
      "Choose tasks as punishment",
      "Distribute tasks fairly and clarify responsibilities",
      "Keep responsibilities secret"
    ],
    answer: 2
  },
  {
    question: "What should a leader do if someone reports bullying or a safety threat?",
    options: [
      "Dismiss the concern",
      "Keep it secret in every situation",
      "Encourage retaliation",
      "Seek help from a trusted responsible person"
    ],
    answer: 3
  }
];

const academyCourseQuizzes = {
  leadership: academyLeadershipQuiz,

  "first-aid": [
    { question: "What is the main purpose of first aid?", options: ["To replace all medical care", "To provide immediate help and support safety", "To diagnose every illness", "To avoid calling for help"], answer: 1 },
    { question: "What should you do first when approaching an emergency?", options: ["Rush in immediately", "Move everything nearby", "Check the scene for danger", "Give the person food"], answer: 2 },
    { question: "When should emergency services be contacted?", options: ["When a serious emergency needs professional help", "Only after several hours", "Only if a friend asks", "Never"], answer: 0 },
    { question: "What should you do if an injured person is unconscious?", options: ["Leave them alone", "Give them a drink", "Force them to stand", "Call for emergency help and follow the operator's guidance"], answer: 3 },
    { question: "What is important when helping someone who is bleeding heavily?", options: ["Ignore the bleeding", "Seek urgent help and apply appropriate pressure if safe", "Give them food", "Ask them to walk around"], answer: 1 },
    { question: "What should you do for a burn?", options: ["Apply toothpaste", "Break any blisters", "Cool the burn with cool running water and seek help as needed", "Cover it with household chemicals"], answer: 2 },
    { question: "Why should you avoid moving a person with a possible serious neck or back injury?", options: ["Movement could worsen the injury", "They must always walk", "It prevents them from speaking", "It makes the scene safer"], answer: 0 },
    { question: "What information is useful when calling emergency services?", options: ["Only your first name", "A guess about the cause", "Unrelated personal stories", "The location, nature of emergency, and condition of the person"], answer: 3 },
    { question: "What is the purpose of a first aid kit?", options: ["To replace emergency professionals", "To store everyday snacks", "To keep basic supplies available for appropriate first aid", "To treat every condition without help"], answer: 2 },
    { question: "What is a responsible action after an emergency?", options: ["Spread unverified rumours", "Follow professional guidance and report what happened accurately", "Hide important information", "Blame the injured person"], answer: 1 }
  ],

  english: [
    { question: "Which word is a noun?", options: ["Quickly", "Beautiful", "Teacher", "Run"], answer: 2 },
    { question: "Choose the grammatically correct sentence.", options: ["She go to school.", "She goes to school.", "She going school.", "She gone to school every day."], answer: 1 },
    { question: "Which word is a verb in 'The children played outside'?", options: ["Children", "The", "Outside", "Played"], answer: 3 },
    { question: "Choose the correct plural of 'child'.", options: ["Children", "Childs", "Childes", "Childrens"], answer: 0 },
    { question: "Which word is closest in meaning to 'begin'?", options: ["Finish", "Forget", "Start", "Close"], answer: 2 },
    { question: "Which sentence uses punctuation correctly?", options: ["Where are you.", "Where are you?", "Where are you,", "Where are you!?"], answer: 1 },
    { question: "What is the main purpose of a paragraph's topic sentence?", options: ["To introduce its main idea", "To list every reference", "To end the whole book", "To confuse the reader"], answer: 0 },
    { question: "Choose the correct word: 'There are ___ books on the desk.'", options: ["much", "anyone", "a", "many"], answer: 3 },
    { question: "What does reading comprehension mean?", options: ["Reading without thinking", "Copying every sentence", "Understanding what a text means", "Memorizing page numbers only"], answer: 2 },
    { question: "Which is appropriate in a formal email to a teacher?", options: ["Yo, answer me now!", "Dear Teacher, I am writing to ask a question.", "Hey!!! What's up??", "Give me the answer."], answer: 1 }
  ],

  "computer-skills": [
    { question: "What is a computer?", options: ["A type of furniture", "A machine that processes data", "A paper notebook", "A household switch"], answer: 1 },
    { question: "Which device is commonly used to type text?", options: ["Monitor", "Speaker", "Keyboard", "Printer"], answer: 2 },
    { question: "What is a folder used for?", options: ["Organizing files", "Increasing screen brightness", "Playing sound only", "Charging a computer"], answer: 0 },
    { question: "Which application is commonly used to create text documents?", options: ["Calculator only", "Camera", "Music player", "Word processor"], answer: 3 },
    { question: "In a spreadsheet, what is a cell?", options: ["A computer battery", "The intersection of a row and column", "A web browser", "A printed page"], answer: 1 },
    { question: "What does a web browser help you do?", options: ["Wash a keyboard", "Repair every hardware problem", "Access websites", "Print without a printer"], answer: 2 },
    { question: "Which is a strong password practice?", options: ["Use a long, unique password and keep it private", "Share it with everyone", "Use '123456' everywhere", "Write it in a public post"], answer: 0 },
    { question: "What should you do with a suspicious email link?", options: ["Click immediately", "Forward it to everyone", "Enter your password", "Avoid clicking and verify the sender"], answer: 3 },
    { question: "What is the purpose of saving a file?", options: ["To delete it permanently", "To keep your work for later use", "To turn off the monitor", "To remove its contents"], answer: 1 },
    { question: "Which action shows responsible technology use?", options: ["Sharing another person's private data", "Installing unknown files without checking", "Respecting privacy and using trusted sources", "Posting passwords online"], answer: 2 }
  ],

  communication: [
    { question: "What is communication?", options: ["Exchanging information and ideas", "Speaking without listening", "Avoiding all feedback", "Giving orders only"], answer: 0 },
    { question: "Which is an example of verbal communication?", options: ["A facial expression", "A spoken conversation", "A hand gesture", "A posture"], answer: 1 },
    { question: "What can body language communicate?", options: ["Only written facts", "Nothing at all", "Feelings and attitudes", "Computer instructions"], answer: 2 },
    { question: "What does active listening involve?", options: ["Interrupting constantly", "Planning your reply without listening", "Ignoring the speaker", "Paying attention and clarifying meaning"], answer: 3 },
    { question: "What helps make a presentation clear?", options: ["Speaking as fast as possible", "Organizing ideas and speaking clearly", "Avoiding preparation", "Using only unfamiliar words"], answer: 1 },
    { question: "What is constructive feedback intended to do?", options: ["Help someone improve", "Embarrass someone", "End all discussion", "Spread rumours"], answer: 0 },
    { question: "How should you respond when you disagree respectfully?", options: ["Insult the other person", "Refuse to listen", "Explain your view calmly and listen to theirs", "Shout until they agree"], answer: 2 },
    { question: "Why is eye contact sometimes useful in conversation?", options: ["It proves every statement is true", "It replaces all words", "It is required in every culture in the same way", "It can show attention, depending on context and culture"], answer: 3 },
    { question: "What should you do if a message is unclear?", options: ["Assume the worst", "Ask a polite clarifying question", "Ignore the speaker forever", "Change the subject immediately"], answer: 1 },
    { question: "Which is an example of respectful communication?", options: ["Listening without insulting others", "Sharing private messages without permission", "Mocking different opinions", "Interrupting every speaker"], answer: 0 }
  ],

  "financial-literacy": [
    { question: "What is money commonly used for?", options: ["Measuring height", "Replacing every skill", "Paying for goods and services", "Guaranteeing wealth"], answer: 2 },
    { question: "Which is usually a need rather than a want?", options: ["A luxury watch", "Basic nutritious food", "The newest gaming device", "An expensive decoration"], answer: 1 },
    { question: "What is a budget?", options: ["A plan for income and spending", "A list of dreams only", "A type of bank card", "A loan agreement only"], answer: 0 },
    { question: "Why is saving money useful?", options: ["It removes every risk", "It guarantees instant wealth", "It means never spending anything", "It helps prepare for future needs and goals"], answer: 3 },
    { question: "What are expenses?", options: ["Only money received", "Money spent on goods, services, or obligations", "A savings account", "A person's goals"], answer: 1 },
    { question: "What is income?", options: ["Money received from work or other sources", "Only money borrowed", "Every item purchased", "A list of expenses"], answer: 0 },
    { question: "What should you consider before borrowing money?", options: ["Only the colour of the contract", "Whether friends approve", "Repayment terms, costs, and your ability to repay", "How quickly you can spend it"], answer: 2 },
    { question: "Which can be a warning sign of a financial scam?", options: ["A clear receipt", "A verified statement", "A realistic budget", "Pressure to send money urgently for a promised reward"], answer: 3 },
    { question: "If your income is lower than your expenses, what should you do?", options: ["Ignore the difference", "Review spending and make a realistic plan", "Borrow without considering repayment", "Spend more immediately"], answer: 1 },
    { question: "Why should you compare prices before buying?", options: ["To make informed spending decisions", "To guarantee every item is perfect", "To avoid checking quality", "To spend your whole budget"], answer: 0 }
  ],

  "career-readiness": [
    { question: "Why is it useful to identify your strengths?", options: ["To avoid learning", "To compare yourself constantly", "To understand skills you can build on", "To guarantee a particular job"], answer: 2 },
    { question: "What is a career goal?", options: ["A random purchase", "A planned aim related to work or professional development", "A list of excuses", "A school timetable only"], answer: 1 },
    { question: "What should a CV or résumé normally include?", options: ["Relevant education, skills, and experience", "False qualifications", "Unrelated private information", "Other people's passwords"], answer: 0 },
    { question: "What is the purpose of a professional application letter?", options: ["To tell unrelated stories", "To demand automatic employment", "To repeat every page of a CV", "To explain your interest and relevant suitability"], answer: 3 },
    { question: "How can you prepare for an interview?", options: ["Arrive without knowing the role", "Research the role and practise clear answers", "Invent qualifications", "Ignore the interview instructions"], answer: 1 },
    { question: "What does reliability at work mean?", options: ["Keeping reasonable commitments and completing tasks responsibly", "Ignoring deadlines", "Blaming colleagues", "Avoiding communication"], answer: 0 },
    { question: "What is workplace ethics?", options: ["Winning at any cost", "Keeping all mistakes secret", "Following responsible principles such as honesty and fairness", "Avoiding every responsibility"], answer: 2 },
    { question: "What is a useful response to a difficult interview question?", options: ["Become insulting", "Make up an experience", "Refuse to communicate", "Answer honestly and explain your reasoning"], answer: 3 },
    { question: "Why is continuous learning important in a career?", options: ["Skills never change", "It helps people adapt and develop skills", "It removes the need for practice", "It guarantees promotion"], answer: 1 },
    { question: "What should you do after receiving constructive feedback?", options: ["Consider it and identify ways to improve", "Ignore all of it automatically", "Blame the person who gave it", "Stop learning"], answer: 0 }
  ]
};

const ACADEMY_QUIZ_SECONDS = 50;
const ACADEMY_PASSING_SCORE = 12;

let academyQuizTimer = null;
window.currentAcademyCourse = window.currentAcademyCourse || null;

async function startAcademyQuiz(course) {
   const questions = academyCourseQuizzes[course.slug];

  const quizPanel = document.querySelector("#academyQuizPanel");
  const certificatePanel = document.querySelector("#academyCertificatePanel");
  if (!quizPanel || !certificatePanel) return;
if (!questions || questions.length === 0) {
  quizPanel.textContent =
    "The quiz for this course is not available yet. Please try again later.";
  return;
}
  if (academyQuizTimer) clearInterval(academyQuizTimer);
  certificatePanel.replaceChildren();
certificatePanel.classList.remove("hidden");
  quizPanel.replaceChildren();




const learnerId = state.session?.user?.id;

if (!learnerId) {
  quizPanel.textContent =
    "Please log in before taking the course quiz.";
  return;
}

quizPanel.textContent = "Checking your course completion...";
certificatePanel.replaceChildren();

try {
  const { data: existingCertificate, error: certificateError } =
    await supabase
      .from("certificates")
      .select("certificate_number, learner_name, course_title, completion_date")
      .eq("user_id", learnerId)
     .eq("course_title", course.title) 
      .maybeSingle();

  if (certificateError) throw certificateError;

 
if (existingCertificate) {
  quizPanel.replaceChildren();

  const completedMessage = document.createElement("h3");
  completedMessage.textContent =
    "Certificate Earned! You can now read notes only.";

  const certificateDetails = document.createElement("p");
  certificateDetails.textContent =
    `Certificate number: ${existingCertificate.certificate_number}`;

  quizPanel.append(completedMessage, certificateDetails);

  certificatePanel.replaceChildren();
  certificatePanel.classList.add("hidden");

  return;
}

} catch (error) {
  console.error("Certificate completion check failed:", error);
  quizPanel.textContent =
    "We could not verify your course completion. Please try again.";
  return;
}

quizPanel.replaceChildren();


  let questionIndex = 0;
  let score = 0;
  let secondsLeft = ACADEMY_QUIZ_SECONDS;
  let answered = false;

  const heading = document.createElement("h4");
  const timer = document.createElement("p");
  const questionText = document.createElement("p");
  const optionsBox = document.createElement("div");
  const feedback = document.createElement("p");

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "Next question";
  nextButton.disabled = true;

  quizPanel.append(heading, timer, questionText, optionsBox, feedback, nextButton);

  function showQuestion() {
    if (academyQuizTimer) clearInterval(academyQuizTimer);

    if (questionIndex >= questions.length) {
      finishQuiz();
      return;
    }

    secondsLeft = ACADEMY_QUIZ_SECONDS;
    answered = false;
    nextButton.disabled = true;
    feedback.textContent = "";
    optionsBox.replaceChildren();

    const question = questions[questionIndex];
    heading.textContent =
      `Question ${questionIndex + 1} of ${questions.length}`;
    questionText.textContent = question.question;
    timer.textContent = `Time remaining: ${secondsLeft} seconds`;

    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.className = "academy-topic-item";

      button.addEventListener("click", () => {
        if (answered) return;
        answered = true;

        if (index === question.answer) {
          score += 2;
          feedback.textContent = "Correct! You earned 2 points.";
        } else {
          feedback.textContent = "Not quite. No points for this question.";
        }

        optionsBox.querySelectorAll("button").forEach(item => {
          item.disabled = true;
        });

        nextButton.disabled = false;
      });

      optionsBox.appendChild(button);
    });

    nextButton.textContent =
      questionIndex === questions.length - 1
        ? "See results"
        : "Next question";

    academyQuizTimer = setInterval(() => {
      secondsLeft -= 1;
      timer.textContent = `Time remaining: ${secondsLeft} seconds`;

      if (secondsLeft <= 0) {
        clearInterval(academyQuizTimer);
        academyQuizTimer = null;

        if (!answered) {
          answered = true;
          feedback.textContent = "Time is up. No points earned for this question.";
          optionsBox.querySelectorAll("button").forEach(item => {
            item.disabled = true;
          });
          nextButton.disabled = false;
        }
      }
    }, 1000);
  }

  nextButton.addEventListener("click", () => {
    if (!answered) return;
    questionIndex += 1;
    showQuestion();
  });

  
  function finishQuiz() {
    if (academyQuizTimer) clearInterval(academyQuizTimer);
    academyQuizTimer = null;
    quizPanel.replaceChildren();
    certificatePanel.replaceChildren();

    const result = document.createElement("h3");
    result.textContent = `Quiz complete: ${score}/20`;
    quizPanel.appendChild(result);

    const message = document.createElement("p");

    if (score >= ACADEMY_PASSING_SCORE) {
    message.textContent =
  `Congratulations! You passed the ${course.title} course quiz!`;
      certificatePanel.classList.remove("hidden");

      const certificateHeading = document.createElement("h3");
      certificateHeading.textContent = "Get your LearnLoop certificate";
      certificatePanel.appendChild(certificateHeading);

      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Your full name";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Enter your full name";
      nameInput.maxLength = 100;
      nameInput.autocomplete = "name";
      nameInput.required = true;
      nameInput.id = "academyCertificateName";

      nameLabel.htmlFor = nameInput.id;
      certificatePanel.append(nameLabel, nameInput);

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "Download Certificate (PDF)";

 
downloadButton.addEventListener("click", async () => {
  const learnerName = nameInput.value.trim();

  if (!learnerName) {
    nameInput.setCustomValidity("Please enter your full name.");
    nameInput.reportValidity();
    nameInput.addEventListener("input", () => {
      nameInput.setCustomValidity("");
    }, { once: true });
    return;
  }

  const jsPDF = window.jspdf?.jsPDF;

  if (!jsPDF) {
    alert("PDF library could not load. Please refresh and try again.");
    return;
  }

        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: "a4"
        });

        const certificateNumber =
          "LL-" + Date.now().toString(36).toUpperCase();

        const completionDate = new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric"
        });

       
        // LearnLoop premium certificate — landscape A4
        // Cream background, navy borders, and gold accents.
        pdf.setFillColor(250, 248, 241);
        pdf.rect(0, 0, 297, 210, "F");

        // Navy outer frame and gold inner border
        pdf.setFillColor(20, 39, 77);
        pdf.rect(0, 0, 297, 210, "F");

        pdf.setFillColor(250, 248, 241);
        pdf.rect(5, 5, 287, 200, "F");

        pdf.setDrawColor(198, 158, 64);
        pdf.setLineWidth(1);
        pdf.rect(9, 9, 279, 192);

        pdf.setDrawColor(20, 39, 77);
        pdf.setLineWidth(0.5);
        pdf.rect(12, 12, 273, 186);

        // Decorative diagonal corner accents
        pdf.setDrawColor(20, 39, 77);
        pdf.setLineWidth(9);
        pdf.line(0, 36, 36, 0);
        pdf.line(261, 210, 297, 174);

        pdf.setDrawColor(198, 158, 64);
        pdf.setLineWidth(3);
        pdf.line(0, 26, 26, 0);
        pdf.line(271, 210, 297, 184);

        // LearnLoop book-inspired brand mark
        pdf.setDrawColor(20, 39, 77);
        pdf.setLineWidth(1.5);
        pdf.line(103, 22, 103, 36);
        pdf.line(103, 22, 113, 26);
        pdf.line(113, 26, 123, 22);
        pdf.line(123, 22, 123, 36);
        pdf.line(103, 36, 113, 40);
        pdf.line(113, 40, 123, 36);
        pdf.setFillColor(198, 158, 64);
        pdf.circle(113, 18, 2.5, "F");

        // Header wordmark and slogan
        pdf.setTextColor(20, 39, 77);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(27);
        pdf.text("LearnLoop", 130, 28);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text("L E A R N   •   S H A R E   •   G R O W", 130, 35);

        pdf.setFont("times", "italic");
        pdf.setFontSize(12);
        pdf.text("Better Learners", 246, 20, { align: "center" });
        pdf.text("A Brighter Future", 246, 27, { align: "center" });

        pdf.setDrawColor(198, 158, 64);
        pdf.setLineWidth(0.6);
        pdf.line(226, 31, 266, 31);

        // Certificate heading
        pdf.setTextColor(20, 39, 77);
        pdf.setFont("times", "bold");
        pdf.setFontSize(27);
        pdf.text("CERTIFICATE OF COMPLETION", 148.5, 52, {
          align: "center"
        });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.text("T H I S   C E R T I F I E S   T H A T", 148.5, 65, {
          align: "center"
        });

        // Gold name ribbon
        pdf.setFillColor(255, 248, 225);
        pdf.setDrawColor(198, 158, 64);
        pdf.setLineWidth(0.7);
        pdf.roundedRect(48, 72, 201, 22, 2, 2, "FD");

        pdf.setTextColor(20, 39, 77);
        pdf.setFont("times", "italic");
        pdf.setFontSize(25);
        pdf.text(learnerName, 148.5, 86.5, {
          align: "center",
          maxWidth: 190
        });

        // Course completion details
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.text("has successfully completed the LearnLoop course", 148.5, 107, {
          align: "center"
        });

        pdf.setFont("times", "bold");
        pdf.setFontSize(27);
       pdf.text(course.title, 148.5, 122, { align: "center" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.text("Through dedication, curiosity and active participation,", 148.5, 134, {
          align: "center"
        });
        pdf.text("you have demonstrated a commitment to lifelong learning.", 148.5, 141, {
          align: "center"
        });

        // Subtle laurel-inspired side decorations
        pdf.setDrawColor(235, 228, 207);
        pdf.setLineWidth(0.7);
        pdf.line(39, 145, 65, 126);
        pdf.line(258, 145, 232, 126);

        for (let i = 0; i < 5; i++) {
          const y = 142 - i * 4;
          pdf.ellipse(43 + i * 3, y, 2, 4, "S");
          pdf.ellipse(254 - i * 3, y, 2, 4, "S");
        }

        // Certificate reference number
        pdf.setTextColor(20, 39, 77);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text("Certificate No.", 48, 164, { align: "center" });

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text(certificateNumber, 48, 173, { align: "center" });

        // Completion date
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text("Completed on", 148.5, 164, { align: "center" });

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(completionDate, 148.5, 173, { align: "center" });

        // LearnLoop administrator signature area — no award seal
        pdf.setDrawColor(20, 39, 77);
        pdf.setLineWidth(0.5);
        pdf.line(207, 173, 270, 173);

        pdf.setTextColor(20, 39, 77);
       
pdf.setFont("times", "italic");
pdf.setFontSize(24);
pdf.text("LearnLoop", 238.5, 168, {
  align: "center",
  angle: -8
});

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.text("LEARNLOOP", 238.5, 180, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.text("PLATFORM ADMINISTRATOR", 238.5, 185, {
          align: "center"
        });

        // Bottom wordmark and slogan
        pdf.setDrawColor(198, 158, 64);
        pdf.setLineWidth(0.6);
        pdf.line(105, 187, 120, 187);
        pdf.line(177, 187, 192, 187);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(15);
        pdf.text("LearnLoop", 148.5, 190, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
      
pdf.text("L E A R N   •   S H A R E   •   G R O W", 148.5, 193, {
  align: "center"
});

pdf.setFont("helvetica", "normal");
pdf.setFontSize(8);
pdf.setTextColor(20, 39, 77);
pdf.text("Visit LearnLoop: https://elise-neon.vercel.app", 148.5, 199, {
  align: "center"
});


        // Generate a unique QR code for this certificate
        const verificationUrl =
          window.location.origin +
          window.location.pathname +
          "?certificate=" +
          encodeURIComponent(certificateNumber);

        const qrContainer = document.createElement("div");

        new QRCode(qrContainer, {
          text: verificationUrl,
          width: 256,
          height: 256,
          correctLevel: QRCode.CorrectLevel.M
        });

        const qrCanvas = qrContainer.querySelector("canvas");

        if (!qrCanvas) {
          alert("Could not generate the verification QR code. Please try again.");
          return;
        }

        // Add the QR code in the lower-left corner
        pdf.addImage(
          qrCanvas.toDataURL("image/png"),
          "PNG",
          18,
          150,
          20,
          20
        );

        pdf.setTextColor(20, 39, 77);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6);
        pdf.text("SCAN TO VERIFY", 28, 174, {
          align: "center"
        });

const { error: saveCertificateError } = await supabase
  .from("certificates")
  .insert({
    user_id: learnerId,
    learner_name: learnerName,
   course_title: course.title,
    score: score,
    certificate_number: certificateNumber,
    completion_date: completionDate
  });

if (saveCertificateError) {
  console.error("Certificate registration failed:", saveCertificateError);
  alert(
    "We could not register your certificate. Please try again. Your certificate has not been downloaded."
  );
  return;
}

pdf.save(`LearnLoop-${course.slug}-Certificate.pdf`);
 
      });

      certificatePanel.appendChild(downloadButton);
      certificatePanel.classList.remove("hidden");
certificatePanel.scrollIntoView({ behavior: "smooth", block: "center" }); 
  
} else {
  message.textContent =
    "Keep learning and try again! You need at least 12 out of 20 points to qualify for a certificate.";
}

quizPanel.appendChild(message);

if (score < ACADEMY_PASSING_SCORE) {
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Try quiz again";
  retryButton.addEventListener("click", () => startAcademyQuiz(course));
  quizPanel.appendChild(retryButton);
}
} // Closes finishQuiz()

showQuestion();

} // Closes startAcademyQuiz()

document.addEventListener("click", function (event) {
  const button = event.target.closest("#academyQuizButton");
  if (!button) return;

  const course = window.currentAcademyCourse;

  if (!course || !academyCourseQuizzes[course.slug]) {
    console.error("No quiz is available for the selected course.");
    return;
  }

  startAcademyQuiz(course);
});

document
  .querySelector("#certificateVerificationForm")
  ?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const numberInput = document.querySelector(
      "#certificateVerificationNumber"
    );
    const result = document.querySelector(
      "#certificateVerificationResult"
    );

    const certificateNumber = numberInput.value.trim();

    if (!certificateNumber || !result) return;

    result.textContent = "Checking certificate...";

    try {
      const { data, error } = await supabase.rpc(
        "verify_learnloop_certificate",
        {
          p_certificate_number: certificateNumber
        }
      );

      if (error) throw error;

      const certificate = Array.isArray(data) ? data[0] : data;

      result.replaceChildren();

      if (!certificate) {
        result.textContent =
          "Certificate not found. No matching official LearnLoop record was found.";
        return;
      }

      const heading = document.createElement("h3");
      heading.textContent = "Certificate verified";

      const details = document.createElement("p");
      details.textContent =
        "Learner: " + certificate.learner_name +
        " | Course: " + certificate.course_title +
        " | Score: " + certificate.score + "/20" +
        " | Completion date: " + certificate.completion_date;

      const reference = document.createElement("p");
      reference.textContent =
        "Certificate number: " + certificate.certificate_number;

      result.append(heading, details, reference);
    } catch (error) {
      console.error("Certificate verification failed:", error);
      result.textContent =
        "Verification is temporarily unavailable. Please try again later.";
    }
  });

const certificateFromQR =
  new URLSearchParams(window.location.search).get("certificate");

if (certificateFromQR) {
  const verificationInput = document.querySelector(
    "#certificateVerificationNumber"
  );

  const verificationForm = document.querySelector(
    "#certificateVerificationForm"
  );

  if (verificationInput && verificationForm) {
    verificationInput.value = certificateFromQR;
    verificationForm.requestSubmit();

    document.querySelector("#certificateVerificationSection")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
// LearnLoop: My uploads document picker
document.addEventListener("DOMContentLoaded", () => {
  const uploadButton = document.querySelector("#accountDocumentUploadButton");
  const fileInput = document.querySelector("#accountDocumentInput");
  const uploadStatus = document.querySelector("#accountUploadStatus");

  if (!uploadButton || !fileInput) return;

  uploadButton.addEventListener("click", () => {
    if (!state.session) {
      toast("Please log in to upload documents.", "error");
      return;
    }

    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    if (!state.session) {
      toast("Please log in to upload documents.", "error");
      fileInput.value = "";
      return;
    }

    uploadButton.disabled = true;

    try {
      for (const file of files) {
        if (uploadStatus) {
          uploadStatus.textContent = `Uploading ${file.name}...`;
        }

        await uploadFile(file);
      }

      if (uploadStatus) {
        uploadStatus.textContent =
          `${files.length} file(s) uploaded successfully.`;
      }

      toast("Your document upload is complete!");
       await loadAccountDocuments();
    } catch (error) {
      console.error("Document upload error:", error);

      if (uploadStatus) {
        uploadStatus.textContent = `Upload failed: ${error.message}`;
      }

      toast(`Could not upload: ${error.message}`, "error");
    } finally {
      uploadButton.disabled = false;
      fileInput.value = "";
    }
  });
});
// LearnLoop: Load the logged-in user's private documents
async function loadAccountDocuments() {
  const list = document.querySelector("#accountDocumentList");
  if (!list) return;

  if (!state.session) {
    list.textContent = "Please log in to view your documents.";
    return;
  }

  list.textContent = "Loading your documents...";

  try {
    const userId = currentUserId();

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(userId, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) throw error;

    list.replaceChildren();

    const files = (data || []).filter(
      file => file.name && file.name !== ".emptyFolderPlaceholder"
    );

    if (!files.length) {
      list.textContent = "You have not uploaded any documents yet.";
      return;
    }

    files.forEach(file => {
      const path = `${userId}/${file.name}`;
      const name = file.name.replace(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
        ""
      );

      const item = document.createElement("div");
      item.className = "account-document-item";

      const filename = document.createElement("div");
      filename.className = "account-document-name";
      filename.textContent = name;

      const actions = document.createElement("div");
      actions.className = "account-document-actions";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "Open";
      openButton.addEventListener("click", async () => {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(path, 60);

        if (error) {
          toast("Could not open this file.", "error");
          return;
        }

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      });

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "Download";
      downloadButton.addEventListener("click", async () => {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(path, 60, {
            download: name
          });

        if (error) {
          toast("Could not download this file.", "error");
          return;
        }

        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = name;
        link.click();
      });

      actions.append(openButton, downloadButton);
      item.append(filename, actions);
      list.append(item);
    });
  } catch (error) {
    console.error("Could not load account documents:", error);
    list.textContent =
      "Could not load your documents. Check your storage permissions and try again.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadAccountDocuments();
});
