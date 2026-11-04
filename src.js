
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
let postMediaObserver = null;
const fileUrlCache = new Map();

const VIEW_INFO = {
  feed: ["Home feed", "Discover what the community is learning."],
  academy: ["LearnLoop Lessons", "Read, understand, take quizzes and earn certificates."], 
  library: ["Learning library", "Explore subjects, books, and learning resources."],
  youtube: ["YouTube Learning", "Search for educational videos and watch them on LearnLoop."],
  discussions: ["Discussions", "Ask questions and share ideas."],
   messages: ["Private Messages", "Chat privately with other LearnLoop learners."],
  community: ["Community", "Learn together and help other learners."],
  people: ["People", "Discover learners and follow their journeys."], 
  posts: ["Posts", "Explore all  posts shared on LearnLoop."], 
  following: ["Following", "Posts from people you follow."],
  saved: ["Saved resources", "Your bookmarked learning resources."],
  myuploads: ["My uploads", "Content you have shared with the community."],
  notifications: ["Notifications", "Updates and activity from LearnLoop."],
  dashboard: ["My dashboard", "An overview of your learning activity."],
   committeeDuty: [
  "My Duty Dashboard",
  "Manage your committee responsibilities and assigned tasks."
]
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
  const removeButton = $("#removeProfilePictureButton");
if (removeButton) {
  removeButton.dataset.removePicture = "false";
} 

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
  if (!requireLogin()) return;

  const name = $("#profileDisplayName")?.value.trim();
  const bio = $("#profileBio")?.value.trim() || "";
  const countryCode = $("#profileCountryCode")?.value || "";
  const phone = $("#profilePhone")?.value.trim() || "";
  const picture = $("#profilePicture")?.files?.[0] || null;
const removePicture = $("#removeProfilePictureButton")?.dataset.removePicture === "true";
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
   if (removePicture) {
  avatarUrl = null;
}  

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
      if ($("#removeProfilePictureButton")) {
  $("#removeProfilePictureButton").dataset.removePicture = "false";
} 
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
  accountButton.innerHTML = '<span aria-hidden="true">👤</span>';
  accountButton.setAttribute("aria-label", "My account");
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
async function approveHonoraryCertificate(requestId, decisionReason) {
  if (!decisionReason?.trim()) {
    alert("Please provide an approval reason.");
    return;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email;

  if (email !== "elisemfitumukiza3@gmail.com") {
    alert("Only the LearnLoop owner can approve certificates.");
    return;
  }

  const { data: request, error } = await supabase
    .from("honorary_certificate_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (error || !request) {
    alert("Could not load this certificate request.");
    return;
  }

  if (request.status !== "pending") {
    alert("This request has already been reviewed.");
    return;
  }

  const jsPDF = window.jspdf?.jsPDF;

  if (!jsPDF || typeof QRCode === "undefined") {
    alert("PDF or QR library could not load. Please refresh.");
    return;
  }

  const certificateNumber =
    "LL-HON-" + Date.now().toString(36).toUpperCase();

  const completionDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
const logoImage = await new Promise((resolve) => {
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    resolve(canvas.toDataURL("image/png"));
  };

  image.onerror = () => resolve(null);
  image.src = "/learnloop-icon.png.png";
});
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  // LearnLoop cream, navy and gold certificate design
  pdf.setFillColor(20, 39, 77);
  pdf.rect(0, 0, 297, 210, "F");

  pdf.setFillColor(250, 248, 241);
  pdf.rect(5, 5, 287, 200, "F");

  pdf.setDrawColor(198, 158, 64);
  pdf.setLineWidth(1);
  pdf.rect(9, 9, 279, 192);
if (logoImage) {
  pdf.addImage(logoImage, "PNG", 18, 15, 24, 24);
}
  pdf.setTextColor(20, 39, 77);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(27);
  pdf.text("LearnLoop", 148.5, 28, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("L E A R N   •   S H A R E   •   G R O W", 148.5, 35, {
    align: "center"
  });

  pdf.setFont("times", "bold");
  pdf.setFontSize(23);
  pdf.text(
    "CERTIFICATE OF HONORARY PARTICIPATION",
    148.5, 57, { align: "center" }
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text("THIS CERTIFICATE IS PROUDLY PRESENTED TO", 148.5, 70, {
    align: "center"
  });

  pdf.setFillColor(255, 248, 225);
  pdf.setDrawColor(198, 158, 64);
  pdf.roundedRect(48, 77, 201, 22, 2, 2, "FD");

  pdf.setTextColor(20, 39, 77);
  pdf.setFont("times", "italic");
  pdf.setFontSize(25);
  pdf.text(request.learner_name, 148.5, 91, {
    align: "center",
    maxWidth: 190
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text("In recognition of outstanding participation and appreciation", 148.5, 115, {
    align: "center"
  });
  pdf.text("for the LearnLoop learning community and course:", 148.5, 123, {
    align: "center"
  });

  pdf.setFont("times", "bold");
  pdf.setFontSize(25);
  pdf.text(request.course_title, 148.5, 139, {
    align: "center",
    maxWidth: 220
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Awarded on", 148.5, 162, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(completionDate, 148.5, 170, { align: "center" });

  pdf.setFont("times", "italic");
  pdf.setFontSize(23);
  pdf.text("LearnLoop", 238, 166, {
    align: "center",
    angle: -8
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("PLATFORM ADMINISTRATOR", 238, 180, {
    align: "center"
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Certificate No: " + certificateNumber, 28, 188);

  pdf.text("Visit LearnLoop: https://elise-neon.vercel.app", 148.5, 198, {
    align: "center"
  });

  const verificationUrl =
    window.location.origin +
    window.location.pathname +
    "?honorary_certificate=" +
    encodeURIComponent(certificateNumber);

  const qrContainer = document.createElement("div");

 new QRCodeLib(qrContainer, {
  text: verificationUrl,
  width: 256,
  height: 256,
  correctLevel: QRCodeLib.CorrectLevel.M
});
  const qrCanvas = qrContainer.querySelector("canvas");

  if (!qrCanvas) {
    alert("Could not generate the verification QR code.");
    return;
  }

  pdf.addImage(
    qrCanvas.toDataURL("image/png"),
    "PNG",
    18,
    151,
    22,
    22
  );

  pdf.setFontSize(6);
  pdf.text("SCAN TO VERIFY", 29, 176, { align: "center" });

  const pdfBlob = pdf.output("blob");
  const filePath = `${request.user_id}/${certificateNumber}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("honorary-certificates")
    .upload(filePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: false
    });

  if (uploadError) {
    console.error(uploadError);
    alert("Certificate upload failed. Please try again.");
    return;
  }

  const { data: urlData } = supabase.storage
    .from("honorary-certificates")
    .getPublicUrl(filePath);

  const certificateUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("honorary_certificate_requests")
    .update({
      status: "approved",
      certificate_number: certificateNumber,
      certificate_url: certificateUrl,
      reviewed_at: new Date().toISOString(),
      reviewed_by: sessionData.session.user.id
    })
    .eq("id", requestId);

  if (updateError) {
    console.error(updateError);
    alert("Certificate was uploaded, but approval could not be saved.");
    return;
  }

  const { error: notificationError } = await supabase
    .from("notifications")
    .insert({
      user_id: request.user_id,
      type: "honorary_certificate",
      title: "Your honorary certificate is ready!",
      message: `Your honorary participation certificate for ${request.course_title} has been approved. Decision reason: ${decisionReason.trim()}`,
      link: certificateUrl,
      is_read: false
    });

  if (notificationError) {
    console.error(notificationError);
    alert("Certificate approved, but its notification could not be sent.");
  } else {
    alert("Certificate approved and sent to the learner's notifications!");
  }

  await loadHonoraryCertificateRequests();
}
async function rejectHonoraryCertificate(requestId, decisionReason) {
  const { data: sessionData } = await supabase.auth.getSession();

  if (sessionData?.session?.user?.email !== "elisemfitumukiza3@gmail.com") {
    alert("Only the LearnLoop owner can reject requests.");
    return;
  }

  if (!decisionReason?.trim()) {
    alert("Please provide a rejection reason.");
    return;
  }

  const { data: request, error: requestError } = await supabase
    .from("honorary_certificate_requests")
    .select("user_id, course_title")
    .eq("id", requestId)
    .eq("status", "pending")
    .single();

  if (requestError || !request) {
    alert("This request could not be found or has already been reviewed.");
    return;
  }

  const { error } = await supabase
    .from("honorary_certificate_requests")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: sessionData.session.user.id
    })
    .eq("id", requestId)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    alert("Could not reject this request.");
    return;
  }

  const { error: notificationError } = await supabase
    .from("notifications")
    .insert({
      user_id: request.user_id,
      type: "honorary_certificate",
      title: "Update on your honorary certificate request",
      message: `Your request for ${request.course_title} was not approved. Decision reason: ${decisionReason.trim()}`,
      is_read: false
    });

  if (notificationError) {
    console.error(notificationError);
    alert("Request rejected, but the notification could not be sent.");
  } else {
    alert("Request rejected and the decision reason sent to the learner.");
  }

  await loadHonoraryCertificateRequests();
}

async function loadHonoraryCertificateRequests() {
  const list = document.querySelector("#honoraryCertificateRequestList");
  if (!list) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email;

  if (email !== "elisemfitumukiza3@gmail.com") {
    list.textContent = "Only the LearnLoop owner can review these requests.";
    return;
  }

  list.textContent = "Loading requests...";

  const { data, error } = await supabase
    .from("honorary_certificate_requests")
   .select("id, user_id, learner_name, course_title, course_slug, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Honorary requests:", error);
    list.textContent = "Could not load certificate requests.";
    return;
  }

  if (!data?.length) {
    list.textContent = "There are no honorary certificate requests yet.";
    return;
  }

  list.replaceChildren();

  data.forEach(request => {
    const card = document.createElement("article");
    card.className = "notification-item";

    const title = document.createElement("strong");
    title.textContent = request.course_title;
const learner = document.createElement("p");
learner.textContent =
  `Learner: ${request.learner_name || "Name not provided"}`;
    const status = document.createElement("p");
    status.textContent = `Status: ${request.status}`;

    const date = document.createElement("small");
    date.textContent = new Date(request.created_at).toLocaleDateString();

    card.append(title, learner, status, date);

    if (request.status === "pending") {
      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "Approve";
      approve.dataset.honoraryAction = "approve";
      approve.dataset.requestId = request.id;

      const reject = document.createElement("button");
      reject.type = "button";
      reject.textContent = "Reject";
      reject.dataset.honoraryAction = "reject";
      reject.dataset.requestId = request.id;

      card.append(approve, reject);
    }

    list.appendChild(card);
  });
}

async function loadNotifications() {
  const list = $("#notificationsList");
  if (!list || !currentUserId()) return;

  list.innerHTML = '<div class="notification-empty">Loading notifications...</div>';

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, link, is_read, created_at")
    .eq("user_id", currentUserId())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Notification loading error:", error);
    list.innerHTML =
      '<div class="notification-empty">Could not load notifications. Please try again.</div>';
    return;
  }

  if (!data?.length) {
    list.innerHTML =
      '<div class="notification-empty">You have no notifications yet.</div>';
    return;
  }

 list.innerHTML = data.map(item => `
  <article class="notification-item ${item.is_read ? "" : "unread"}">
    <strong>${escapeHTML(item.title)}</strong>
    <p>${escapeHTML(item.message)}</p>

    ${
      item.link && /^https:\/\//i.test(item.link)
        ? `<p><a href="${escapeHTML(item.link)}"
             target="_blank"
             rel="noopener noreferrer">
             Download honorary certificate (PDF)
           </a></p>`
        : ""
    }

    <div class="notification-time">
      ${escapeHTML(relativeTime(item.created_at))}
    </div>
  </article>
`).join("");
}
async function updateCommitteeDutyNav() {
  const button = document.getElementById("committeeDutyNavButton");

  if (!button || !state.session) {
    button?.classList.add("hidden");
    return;
  }

  const { data, error } = await supabase
    .from("committee_members")
    .select("id")
    .eq("user_id", state.session.user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not check committee membership:", error);
    button.classList.add("hidden");
    return;
  }

  button.classList.toggle("hidden", !data);
}
async function afterLogin() {
  await fetchProfile();
  updateAccountUI();
   await updateCommitteeDutyNav();
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
  ["people", "following", "saved", "myuploads", "notifications", "dashboard", "messages","committeeDuty"].includes(view) &&
  !state.session
) {
    openDialog("authDialog");
    return;
  }
if (view === "committeeDuty") {
  const dutyNav = document.getElementById("committeeDutyNavButton");

  const { data: dutyMember, error: dutyError } = await supabase
    .from("committee_members")
    .select("role, responsibilities")
    .eq("user_id", state.session.user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (dutyError || !dutyMember) {
    dutyNav?.classList.add("hidden");
    alert("Your committee duty dashboard is not currently available.");
    return;
  }

  dutyNav?.classList.remove("hidden");

  document.getElementById("committeeDutyRole").textContent =
    dutyMember.role || "Committee Member";

  document.getElementById("committeeDutyResponsibilities").textContent =
    dutyMember.responsibilities || "No responsibilities specified.";
   await loadMyCommitteeTasks();
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
     posts: "postsView",
   academy: "academyView",
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
     committeeDuty: "committeeDutyView",
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
  if (view === "dashboard") updateDashboard();
   if (view === "community") renderCommunityAchievements();
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
  if (view === "notifications") loadNotifications(); 
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
let messageUserSearchTimer = null;

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
    navigate("posts");
    toast("Your post has been published!");
  } catch (error) {
    console.error("Publish error:", error);
    toast(`Could not publish: ${error.message}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

/* ---------- File access ---------- */




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

   
    ${post.file_path ? (
  isVideo(post.file_mime || "")
    ? `
      <div class="post-video-card" data-file-path="${escapeHTML(post.file_path)}">
        <button type="button" class="post-video-preview" data-action="play-video">
          <video class="post-video-thumbnail"
            muted
            playsinline
            preload="metadata"></video>
          <span class="post-video-play-icon">▶</span>
        </button>
        <div class="post-video-title">
          <strong>${escapeHTML(post.file_name || "Learning video")}</strong>
        </div>
      </div>
    `
    : (
        (post.file_mime || "").toLowerCase().startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp)$/i.test(post.file_name || "")
      )
      ? `
        <div class="post-image-card" data-file-path="${escapeHTML(post.file_path)}">
          <img
            class="post-image-preview"
            alt="${escapeHTML(post.file_name || "Post image")}"
            loading="lazy">
        </div>
      `
      : (
          (post.file_mime || "").toLowerCase() === "application/pdf" ||
          /\.pdf$/i.test(post.file_name || "")
        )
        ? `
          <div class="post-pdf-card" data-file-path="${escapeHTML(post.file_path)}">
            <div class="post-pdf-heading">
              <span>📄</span>
              <strong>${escapeHTML(post.file_name || "PDF Document")}</strong>
            </div>
            <div class="post-pdf-preview">
              <button type="button" data-action="preview-pdf">
                📖 Preview document
              </button>
            </div>
            <small class="post-pdf-caption">PDF document · Preview first page</small>
          </div>
        `
        : `
          <div class="post-attachment" data-file-path="${escapeHTML(post.file_path)}">
            <div class="post-attachment-icon">${fileIcon(post.file_mime || "")}</div>
            <div class="post-attachment-info">
              <strong>${escapeHTML(post.file_name || "Learning resource")}</strong>
              <small>Attached learning resource</small>
            </div>
            <button class="button button-secondary" data-action="open-file" type="button">
              Open
            </button>
          </div>
        `
) : ""}


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
      ${ownPost
  ? `<button type="button" class="post-action" data-action="delete-post">🗑 Remove</button>`
  : `<button type="button" class="post-action" data-action="report">⚑ Report</button>`}
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
  renderPostList(
    $("#postsFeed"),
    filteredPosts("all"),
    "No posts yet",
    "Be the first to share a useful learning resource."
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

  loadPostVideoThumbnails();
  loadPostImagePreviews();
}


function observePostMedia(card) {
  if (!("IntersectionObserver" in window)) {
    if (card.classList.contains("post-image-card")) {
      loadPostImageCard(card);
    } else {
      loadPostVideoCard(card);
    }
    return;
  }

  if (!postMediaObserver) {
    postMediaObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const card = entry.target;
        postMediaObserver.unobserve(card);

        if (card.classList.contains("post-image-card")) {
          loadPostImageCard(card);
        } else {
          loadPostVideoCard(card);
        }
      });
    }, { rootMargin: "400px 0px" });
  }

  postMediaObserver.observe(card);
}

function loadPostVideoThumbnails() {
  document.querySelectorAll(".post-video-card")
    .forEach(observePostMedia);
}

function loadPostImagePreviews() {
  document.querySelectorAll(".post-image-card")
    .forEach(observePostMedia);
}

async function loadPostImageCard(card) {
  const path = card.dataset.filePath;
  const image = card.querySelector(".post-image-preview");

  if (!path || !image || image.dataset.loaded === "true") return;

  image.dataset.loaded = "true";
  image.decoding = "async";

  const url = await getFileUrl(path);

  if (!url) {
    image.dataset.loaded = "false";
    return;
  }

  image.src = url;

  image.addEventListener("error", () => {
    image.dataset.loaded = "false";
  }, { once: true });
}

async function loadPostVideoCard(card) {
  const path = card.dataset.filePath;
  const thumbnail = card.querySelector(".post-video-thumbnail");

  if (!path || !thumbnail || thumbnail.dataset.loaded === "true") return;

  thumbnail.dataset.loaded = "true";

  const url = await getFileUrl(path);

  if (!url) {
    thumbnail.dataset.loaded = "false";
    return;
  }

  thumbnail.addEventListener("loadedmetadata", () => {
    if (thumbnail.duration > 0) {
      thumbnail.currentTime = Math.min(1, thumbnail.duration / 2);
    }
  }, { once: true });

  thumbnail.addEventListener("seeked", () => {
    thumbnail.pause();
  }, { once: true });

  thumbnail.src = url;
}

async function getFileUrl(path) {
  if (!path) return null;

  const cached = fileUrlCache.get(path);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    console.warn("File URL error:", error.message);
    return null;
  }

  const url = data?.signedUrl || null;

  if (url) {
    fileUrlCache.set(path, {
      url,
      expiresAt: Date.now() + 50 * 60 * 1000
    });
  }

  return url;
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
  
} else if (action === "delete-post") {
  const userId = currentUserId();

  if (!userId || String(post.user_id) !== String(userId)) {
    toast("You can only remove your own posts.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Are you sure you want to remove this post? This cannot be undone."
  );

  if (!confirmed) return;

  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", post.id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Post deletion error:", error);
    toast("Could not remove the post.", "error");
    return;
  }

  if (!data) {
    toast("Post not found or you cannot remove it.", "error");
    return;
  }

  state.posts = state.posts.filter(
    item => String(item.id) !== String(post.id)
  );

  renderAllFeeds();
  toast("Your post was removed.");
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
  } else if (action === "play-video") {
  const path = card.querySelector("[data-file-path]")?.dataset.filePath;
  if (!path) return;

  const url = await getFileUrl(path);

  if (!url) {
    toast("The video could not be loaded. Please check storage access.", "error");
    return;
  }

  const videoCard = card.querySelector(".post-video-card");
  if (!videoCard) return;

  const player = document.createElement("video");
  player.className = "post-video-player";
  player.controls = true;
  player.autoplay = true;
  player.playsInline = true;
  player.preload = "metadata";
  player.src = url;

  videoCard.replaceChildren(player);

     player.play().catch(() => {
      toast("Press play on the video to start watching.");
    });
  

 
} else if (action === "preview-pdf") {
  const pdfCard = card.querySelector(".post-pdf-card");
  const path = pdfCard?.dataset.filePath;
  if (!path || !pdfCard) return;

  const url = await getFileUrl(path);

  if (!url) {
    toast("The PDF could not be loaded.", "error");
    return;
  }

  const preview = document.createElement("iframe");
  preview.className = "post-pdf-frame";
  preview.src = `${url}#page=1&view=FitH`;
  preview.title = "PDF document preview";
  preview.setAttribute("loading", "lazy");

  const fitButton = document.createElement("button");
  fitButton.type = "button";
  fitButton.className = "post-pdf-fit-button";
  fitButton.dataset.action = "fit-pdf";
  fitButton.title = "Fit PDF to window";
  fitButton.textContent = "⛶";

  const previewArea = pdfCard.querySelector(".post-pdf-preview");
  previewArea.replaceChildren(preview, fitButton);

} else if (action === "fit-pdf") {
  const pdfCard = card.querySelector(".post-pdf-card");
  if (!pdfCard) return;

  if (!document.fullscreenElement) {
    pdfCard.requestFullscreen?.().catch(() => {
      toast("Could not expand the PDF preview.", "error");
    });
  } else {
    document.exitFullscreen?.();
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
  const educationLevel = $("#libraryEducationLevel")?.value || "All";

  const levelSearchTerms = {
    "Primary": "primary school textbooks",
    "Lower Secondary": "lower secondary school textbooks",
    "Upper Secondary": "high school textbooks",
    "TVET": "technical vocational education",
    "University and College": "university college textbooks",
    "Postgraduate": "advanced academic textbooks",
    "Doctoral and Research": "research methodology academic books",
    "Professors and Educators": "teaching education academic books"
  };

  const searchQuery = typedQuery ||
    (subject && subject !== "All subjects"
      ? `subject:${subject}`
      : levelSearchTerms[educationLevel] || "");

    if (!searchQuery) {
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

      endpoint.searchParams.set("q", searchQuery);
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
// LearnLoop Home slideshow rotation and controls
(function initHomeSlideshow() {
  const container = document.querySelector(".home-slideshow");
  if (!container) return;

  const slides = Array.from(container.querySelectorAll(".home-slide"));
  const dotsContainer = container.querySelector("#homeSlideDots");
  const prevButton = container.querySelector("#homeSlidePrev");
  const nextButton = container.querySelector("#homeSlideNext");

  if (slides.length < 2) return;

  let currentSlide = 0;
  let slideTimer;

  if (dotsContainer) {
    dotsContainer.innerHTML = slides.map((_, index) => `
      <button
        type="button"
        class="home-slide-dot${index === 0 ? " active" : ""}"
        aria-label="Go to slide ${index + 1}"
        aria-current="${index === 0 ? "true" : "false"}"
        data-home-slide="${index}">
      </button>
    `).join("");
  }

  function showSlide(index) {
    currentSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      slide.classList.toggle("active", i === currentSlide);
    });

    dotsContainer?.querySelectorAll(".home-slide-dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === currentSlide);
      dot.setAttribute("aria-current", i === currentSlide ? "true" : "false");
    });
  }

  function startTimer() {
    clearInterval(slideTimer);
    slideTimer = setInterval(() => showSlide(currentSlide + 1), 5000);
  }

  prevButton?.addEventListener("click", () => {
    showSlide(currentSlide - 1);
    startTimer();
  });

  nextButton?.addEventListener("click", () => {
    showSlide(currentSlide + 1);
    startTimer();
  });

  dotsContainer?.addEventListener("click", event => {
    const dot = event.target.closest("[data-home-slide]");
    if (!dot) return;

    showSlide(Number(dot.dataset.homeSlide));
    startTimer();
  });

  showSlide(0);
  startTimer();
})();
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
  const learningStatIds = [
    "academyCoursesCompleted",
    "academyLessonsRead",
    "academyCoursesInProgress"
  ];

  if (!state.session) {
    [
      "statPosts",
      "statComments",
      "statReactions",
      ...learningStatIds
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0";
    });
    return;
  }

  // Read the learner's existing Academy progress.
  const academyProgress = getAcademyProgress();

  const academyStats = learnLoopCourses.reduce((totals, course) => {
    const savedTopics = Array.isArray(academyProgress[course.slug])
      ? academyProgress[course.slug]
      : [];

    const readTopics = [...new Set(savedTopics)].filter(index =>
      Number.isInteger(index) &&
      index >= 0 &&
      index < course.topics.length
    );

    const completed = academyCourseIsComplete(course, {
      [course.slug]: readTopics
    });

    totals.lessonsRead += readTopics.length;

    if (completed) {
      totals.coursesCompleted++;
    } else if (readTopics.length > 0) {
      totals.coursesInProgress++;
    }

    return totals;
  }, {
    coursesCompleted: 0,
    lessonsRead: 0,
    coursesInProgress: 0
  });

  const [postsResult, commentsResult, reactionsResult] = await Promise.all([
    supabase.from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId())
      .eq("status", "published"),

    supabase.from("comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId())
      .eq("status", "published"),

    supabase.from("reactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId())
  ]);

  const values = {
    statPosts: postsResult.count ?? 0,
    statComments: commentsResult.count ?? 0,
    statReactions: reactionsResult.count ?? 0,
    academyCoursesCompleted: academyStats.coursesCompleted,
    academyLessonsRead: academyStats.lessonsRead,
    academyCoursesInProgress: academyStats.coursesInProgress
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
    <p class="muted small">
      ${escapeHTML(bio || "No bio added yet.")}
    </p>

  
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
  await renderHostReports();
}

async function renderHostReports() {
  const container = $("#hostReportsList");
  if (!container) return;

  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, post_id, reporter_id, reason, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Host reports load error:", error);
    container.innerHTML =
      '<p class="muted">Could not load reports. Check reports table permissions.</p>';
    return;
  }

  if (!reports?.length) {
    container.innerHTML =
      '<p class="muted">No reports have been submitted yet.</p>';
    return;
  }

  const postIds = [...new Set(reports.map(r => r.post_id).filter(Boolean))];
  const reporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];

  const [postsResult, profilesResult] = await Promise.all([
    postIds.length
      ? supabase.from("posts").select("id, body").in("id", postIds)
      : Promise.resolve({ data: [], error: null }),
    reporterIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", reporterIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (postsResult.error) console.error("Reported posts load error:", postsResult.error);
  if (profilesResult.error) console.error("Reporters load error:", profilesResult.error);

  const postsById = new Map((postsResult.data || []).map(p => [String(p.id), p]));
  const profilesById = new Map((profilesResult.data || []).map(p => [String(p.id), p]));

  container.innerHTML = reports.map(report => {
    const post = postsById.get(String(report.post_id));
    const profile = profilesById.get(String(report.reporter_id));
    const date = report.created_at
      ? new Date(report.created_at).toLocaleString()
      : "Date unavailable";

    return `
      <article class="card" style="margin-bottom:14px;">
        <strong>Reported post</strong>
        <p>${escapeHTML(post?.body || "Post unavailable or deleted.")}</p>

        <p class="muted small">
          Reported by: ${escapeHTML(profile?.display_name || "Unknown learner")}
        </p>

        <p><strong>Reason:</strong> ${escapeHTML(report.reason)}</p>

        <p class="muted small">
          Date: ${escapeHTML(date)}
        </p>

        <p><strong>Status:</strong> ${escapeHTML(report.status)}</p>
      </article>
    `;
  }).join("");
}
async function loadMyCommitteeTasks() {
  const container = document.getElementById("committeeDutyTasks");

  if (!container || !state.session) return;
// Set today's date using the user's local time
const reportDateInput = document.getElementById("committeeReportDate");

if (reportDateInput && !reportDateInput.value) {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  reportDateInput.value = localDate;
}

// Connect the daily report form once
const reportForm = document.getElementById("committeeDailyReportForm");

if (reportForm && !reportForm.dataset.handlerBound) {
  reportForm.dataset.handlerBound = "true";

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("committeeReportMessage");
    const submitButton = reportForm.querySelector('button[type="submit"]');

    const report = {
      user_id: state.session.user.id,
      report_date: reportDateInput.value,
      accomplishments: document.getElementById("committeeReportAccomplishments").value.trim(),
      challenges: document.getElementById("committeeReportChallenges").value.trim(),
      next_steps: document.getElementById("committeeReportNextSteps").value.trim()
    };

    if (!report.report_date || !report.accomplishments) {
      message.textContent = "Please enter the date and your accomplishments.";
      return;
    }

    submitButton.disabled = true;
    message.textContent = "Submitting your report...";

    const { error } = await supabase
      .from("committee_daily_reports")
      .upsert(report, {
        onConflict: "user_id,report_date"
      });

    submitButton.disabled = false;

    if (error) {
      console.error("Daily report error:", error);
      message.textContent = "Could not submit your report. Please try again.";
      return;
    }

    message.textContent = "Your daily report was submitted successfully.";
  });
}
  container.textContent = "Loading your tasks...";

  const { data, error } = await supabase
    .from("committee_tasks")
    .select("id, title, description, status, created_at")
    .eq("assigned_to", state.session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load committee tasks:", error);
    container.textContent = "Could not load your assigned tasks.";
    return;
  }

  container.replaceChildren();

  if (!data || !data.length) {
    container.textContent = "No tasks assigned yet.";
    return;
  }

  data.forEach(task => {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = task.title || "Untitled task";

    const description = document.createElement("p");
    description.textContent = task.description || "No description provided.";

    const status = document.createElement("p");
    status.textContent = "Status: " + (task.status || "Pending");

    card.append(title, description, status);
    container.append(card);
  });
}
async function loadCommitteeWeeklyReports() {
  const list = document.getElementById("committeeWeeklyReportsList");
  const weekInput = document.getElementById("committeeReportWeek");

  if (!list || !weekInput || !isOwner()) return;

  const selectedWeek = weekInput.value;

  if (!selectedWeek) {
    list.textContent = "Please select a week.";
    return;
  }

  // Calculate Monday and Sunday of the selected week
  const [year, week] = selectedWeek.split("-W").map(Number);

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(januaryFourth);

  monday.setUTCDate(
    januaryFourth.getUTCDate() -
    ((januaryFourth.getUTCDay() + 6) % 7) +
    (week - 1) * 7
  );

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const startDate = monday.toISOString().slice(0, 10);
  const endDate = sunday.toISOString().slice(0, 10);

  list.textContent = "Loading weekly reports...";

  const { data: reports, error } = await supabase
    .from("committee_daily_reports")
    .select("user_id, report_date, accomplishments, challenges, next_steps")
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: false });

  if (error) {
    console.error("Weekly reports error:", error);
    list.textContent = "Could not load weekly reports.";
    return;
  }

  const { data: members, error: membersError } = await supabase
    .from("committee_members")
    .select("user_id, email, role");

  if (membersError) {
    console.error("Committee member details error:", membersError);
  }

  const memberMap = new Map(
    (members || []).map(member => [member.user_id, member])
  );

  list.replaceChildren();

  if (!reports || !reports.length) {
    list.textContent = "No committee reports were submitted for this week.";
    return;
  }

  reports.forEach(report => {
    const member = memberMap.get(report.user_id);

    const card = document.createElement("article");
    card.className = "card";

    const heading = document.createElement("h4");
    heading.textContent = member?.role || "Committee Member";

    const email = document.createElement("p");
    email.textContent = member?.email || "Member details unavailable.";

    const date = document.createElement("p");
    date.textContent = "Report date: " + report.report_date;

    const accomplishments = document.createElement("p");
    accomplishments.textContent =
      "Accomplishments: " + report.accomplishments;

    const challenges = document.createElement("p");
    challenges.textContent =
      "Challenges: " + (report.challenges || "None reported.");

    const nextSteps = document.createElement("p");
    nextSteps.textContent =
      "Next steps: " + (report.next_steps || "Not specified.");

    card.append(
      heading,
      email,
      date,
      accomplishments,
      challenges,
      nextSteps
    );

    list.append(card);
  });
}
async function loadCommitteeMembers() {
  const list = $("#committeeMembersList");
  if (!list || !isOwner()) return;
// Handle committee duty removal
if (!list.dataset.removeHandlerBound) {
  list.dataset.removeHandlerBound = "true";

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-committee-remove]");
    if (!button) return;

    if (!isOwner()) return;

    const memberId = button.dataset.committeeRemove;
    const userId = button.dataset.memberUser;

    if (!memberId || !userId) {
      alert("Could not identify this committee member.");
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to remove this member from committee duty? Their personal account will remain active."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Removing...";

    const { error: updateError } = await supabase
      .from("committee_members")
      .update({ active: false })
      .eq("id", memberId)
      .eq("user_id", userId);

    if (updateError) {
      console.error(updateError);
      alert("Could not remove this member from duty.");
      button.disabled = false;
      button.textContent = "✖ Remove from duty";
      return;
    }

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        type: "committee_duty_removed",
        title: "Your committee duty has ended",
        message: "You have been removed from your committee position. Your personal LearnLoop account remains active.",
        is_read: false
      });

    if (notificationError) {
      console.error(notificationError);
      alert("Duty was removed, but the notification could not be sent.");
    } else {
      alert("Committee duty removed and notification sent successfully.");
    }

    await loadCommitteeMembers();
  });
}
  list.textContent = "Loading committee members…";

  const { data, error } = await supabase
    .from("committee_members")
    .select("id, user_id, email, role, responsibilities, active")
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load committee members.";
    console.error(error);
    return;
  }

  list.replaceChildren();

  const activeMembers = (data || []).filter(member => member.active);

  if (!activeMembers.length) {
    list.textContent = "No active committee members yet.";
    return;
  }

  activeMembers.forEach(member => {
    const card = document.createElement("article");
    card.className = "card";

 card.innerHTML = `
  <h4>${escapeHTML(member.role)}</h4>
  <p>${escapeHTML(member.email)}</p>
  <p>${escapeHTML(member.responsibilities || "No responsibilities specified.")}</p>

  <button type="button"
    class="button button-primary"
    data-committee-message="${escapeHTML(member.user_id)}">
    ✉ Message
  </button>

  <button type="button"
    class="button"
    data-committee-edit="${escapeHTML(member.user_id)}">
    ✏ Edit position
  </button>

  <button type="button"
    class="button"
    data-committee-remove="${escapeHTML(member.id)}"
    data-member-user="${escapeHTML(member.user_id)}">
    ✖ Remove from duty
  </button>

  <div class="committee-action-area"></div>
`;

list.append(card);
});
}
  
async function loadCommitteeApplications() {
  const list = $("#committeeApplicationsList");
  if (!list || !isOwner()) return;

  list.textContent = "Loading applications…";

  const { data, error } = await supabase
    .from("committee_applications")
    .select("id, email, reason, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Committee applications error:", error);
    list.textContent = "Could not load applications.";
    return;
  }

  if (!data || data.length === 0) {
    list.textContent = "No committee applications yet.";
    return;
  }

  list.innerHTML = data.map(application => `
    <div class="card">
      <p><strong>Applicant:</strong> ${escapeHTML(application.email)}</p>
      <p><strong>Reason:</strong> ${escapeHTML(application.reason)}</p>
      <p><strong>Status:</strong> ${escapeHTML(application.status)}</p>
      ${
        application.status === "pending"
          ? `
            <button type="button" data-review-committee="approved" data-id="${application.id}">
              Approve
            </button>
            <button type="button" data-review-committee="rejected" data-id="${application.id}">
              Reject
            </button>
          `
          : ""
      }
    </div>
  `).join("");
}
async function reviewCommitteeApplication(event) {
  const button = event.target.closest("[data-review-committee]");
  if (!button || !isOwner()) return;

  const applicationId = button.dataset.id;
  const decision = button.dataset.reviewCommittee;

  if (!applicationId || !["approved", "rejected"].includes(decision)) return;

  const confirmed = window.confirm(
    `Are you sure you want to ${decision} this application?`
  );

  if (!confirmed) return;

  button.disabled = true;

  const { error } = await supabase
    .from("committee_applications")
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUserId()
    })
    .eq("id", applicationId)
    .eq("status", "pending");

  if (error) {
    console.error("Application review error:", error);
    toast("Could not update the application.", "error");
    button.disabled = false;
    return;
  }

  toast(`Application ${decision}.`);
  await loadCommitteeApplications();
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
async function submitCommitteeApplication(event) {
  event.preventDefault();

  if (!requireLogin()) return;

  const reason = $("#committeeApplicationReason")?.value.trim();
  const status = $("#committeeApplicationStatus");

  if (!reason || reason.length < 20) {
    if (status) status.textContent = "Please explain your reasons in at least 20 characters.";
    return;
  }

  const user = state.session?.user;

  if (!user) return;

  const { error } = await supabase
    .from("committee_applications")
    .insert({
      user_id: user.id,
      email: user.email,
      reason,
      status: "pending"
    });

  if (error) {
    if (error.code === "23505") {
      if (status) status.textContent = "You already have a pending application.";
    } else {
      console.error("Committee application error:", error);
      if (status) status.textContent = "Application could not be submitted. Please try again.";
    }
    return;
  }

  $("#committeeApplicationForm")?.reset();

  if (status) {
    status.textContent = "Your application has been submitted successfully. The LearnLoop owner will review it.";
  }

  toast("Committee application submitted successfully.");
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
card.style.cursor = "pointer";
card.addEventListener("click", openVideo);
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
    ],
     
  };
const courseLessons =
  lessons[course.slug] || academyAdditionalLessons[course.slug];
 
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
const academyAdditionalLessons = {
     "nutrition-healthy-living": [
    {
      title: "Introduction to Nutrition and Healthy Living",
      paragraphs: [
        "Nutrition is the process through which the body obtains and uses nutrients from food. These nutrients provide energy, support growth, help repair tissues, and maintain normal body functions.",
        "Healthy living combines balanced nutrition with physical activity, adequate rest, safe food practices, and positive everyday habits. These areas work together to support physical and mental wellbeing.",
        "For example, a learner who eats regular balanced meals, drinks enough safe water, gets sufficient rest, and remains physically active supports concentration and everyday performance."
      ],
      keyPoint: "Healthy living depends on balanced nutrition and consistent habits, not one particular food."
    },
    {
      title: "Understanding Food Groups",
      paragraphs: [
        "Different foods provide different nutrients. Common food groups include fruits, vegetables, grains, protein-rich foods, and dairy products or suitable alternatives.",
        "Fruits and vegetables provide vitamins, minerals, and fibre. Grains provide energy, while foods such as beans, eggs, fish, and meat provide protein and other important nutrients. Dairy products and fortified alternatives can provide calcium and other nutrients.",
        "A varied diet helps the body receive a wider range of nutrients. Local foods such as beans, sweet potatoes, bananas, vegetables, maize, and other available foods can contribute to balanced meals."
      ],
      keyPoint: "Eating a variety of foods helps provide the different nutrients the body needs."
    },
    {
      title: "Essential Nutrients and Their Functions",
      paragraphs: [
        "The body needs several types of nutrients. Carbohydrates are an important energy source, proteins support growth and tissue repair, and fats provide energy and help the body absorb certain vitamins.",
        "Vitamins and minerals support many body processes, including immunity, healthy bones, blood formation, and normal nerve function. Fibre supports digestion, while water helps regulate body temperature and transport substances.",
        "No single nutrient performs every function. A balanced eating pattern combines different foods so that the body receives the nutrients required for normal development and daily activities."
      ],
      keyPoint: "Carbohydrates, proteins, fats, vitamins, minerals, fibre, and water all have important roles."
    },
    {
      title: "Balanced Meals and Healthy Food Choices",
      paragraphs: [
        "A balanced meal contains a suitable variety of foods that provide energy and essential nutrients. The combination may differ depending on age, activity, availability, culture, and individual needs.",
        "A practical meal can include vegetables or fruits, a source of protein such as beans or eggs, and an energy-providing food such as rice, potatoes, maize, or sweet potatoes.",
        "Healthy food choices do not require expensive ingredients. Planning meals around accessible seasonal foods can help households prepare nutritious meals while respecting their budgets and preferences."
      ],
      keyPoint: "Balanced meals combine variety, nutritional value, and foods that are realistically available."
    },
    {
      title: "Hydration and the Importance of Water",
      paragraphs: [
        "Water is essential for life. It helps regulate body temperature, supports digestion, transports nutrients, and assists the body in removing waste.",
        "The amount of water a person needs varies with age, activity, climate, health, and other circumstances. Hot weather and physical activity can increase the need for fluids.",
        "Safe drinking water should be used whenever possible. Drinking clean water regularly and paying attention to thirst are useful everyday habits."
      ],
      keyPoint: "Safe water is essential for normal body functions and everyday wellbeing."
    },
    {
      title: "Food Safety and Healthy Preparation",
      paragraphs: [
        "Food safety means handling, preparing, storing, and serving food in ways that reduce the risk of illness. Unsafe food can contain harmful microorganisms or contaminants.",
        "Important food safety habits include washing hands before food preparation, cleaning utensils and surfaces, separating raw foods from ready-to-eat foods, cooking foods thoroughly, and storing food appropriately.",
        "Fruits and vegetables should be washed with safe water. Food should be protected from insects, animals, dust, and other possible sources of contamination."
      ],
      keyPoint: "Clean handling, proper preparation, and safe storage help prevent food-related illness."
    },
    {
      title: "Building Lifelong Healthy Living Habits",
      paragraphs: [
        "Healthy living is developed through realistic habits that can be maintained over time. Nutrition is important, but physical activity, sufficient sleep, hygiene, and social wellbeing also contribute to health.",
        "Individuals can build healthy routines by choosing varied meals, drinking safe water, participating in enjoyable physical activities, resting adequately, and seeking reliable health information.",
        "Healthy habits should be suitable for each person's circumstances. Families, schools, and communities can support wellbeing by making nutritious foods, safe water, learning opportunities, and healthy environments more accessible."
      ],
      keyPoint: "Long-term wellbeing grows from practical, balanced habits that can be maintained throughout life."
    }
  ],
  "personal-hygiene": [
    {
      title: "Understanding Personal Hygiene",
      paragraphs: [
        "Personal hygiene is the daily practice of keeping the body clean and maintaining habits that support health, comfort, and confidence. It includes caring for the skin, hair, teeth, hands, clothing, and other parts of the body.",
        "Good hygiene helps reduce the spread of germs and supports a healthy learning and working environment. It is important at home, at school, at work, and in public places.",
        "For example, washing hands before eating, keeping clothes clean, brushing teeth regularly, and maintaining clean living spaces are simple habits that contribute to personal wellbeing."
      ],
      keyPoint: "Personal hygiene is a collection of everyday habits that protect health and promote wellbeing."
    },
    {
      title: "Hand Hygiene and Germ Prevention",
      paragraphs: [
        "Hands come into contact with many surfaces throughout the day. Some surfaces may carry germs that can spread when people touch their eyes, nose, mouth, food, or other objects.",
        "Hand hygiene means keeping hands clean through appropriate washing. It is especially important before preparing or eating food, after using the toilet, after handling waste, and after coughing or sneezing.",
        "In schools and workplaces, accessible handwashing facilities and good hygiene habits help protect entire communities. People should also avoid sharing personal items that may transfer germs."
      ],
      keyPoint: "Clean hands help reduce the spread of germs between people and surfaces."
    },
    {
      title: "Oral Hygiene and Dental Care",
      paragraphs: [
        "Oral hygiene involves caring for the teeth, gums, tongue, and mouth. Healthy oral habits help prevent common dental problems and support comfortable eating and speaking.",
        "Brushing teeth regularly with suitable toothpaste, cleaning between teeth, and limiting frequent sugary snacks are important habits. Regular dental check-ups can help identify concerns early.",
        "Oral health is connected to general wellbeing. Pain or untreated dental problems can affect concentration, sleep, communication, and daily activities."
      ],
      keyPoint: "Consistent oral care supports healthy teeth, gums, and overall wellbeing."
    },
    {
      title: "Skin, Hair, and Body Care",
      paragraphs: [
        "The skin is the body's outer protective covering. Keeping it clean and caring for it appropriately helps maintain comfort and supports its protective role.",
        "Basic body care includes regular bathing, wearing clean clothes, keeping hair clean, and using personal care products suitable for individual needs. Personal towels, combs, and similar items should not be shared without proper cleaning.",
        "People have different skin and hair types, so personal care routines may vary. Good care should focus on cleanliness, comfort, and health rather than unrealistic appearance standards."
      ],
      keyPoint: "Body care should protect cleanliness, comfort, and the natural health of skin and hair."
    },
    {
      title: "Clean Clothing and Personal Items",
      paragraphs: [
        "Clothing and personal items can collect sweat, dirt, and microorganisms during everyday activities. Keeping them clean contributes to personal comfort and helps maintain hygienic surroundings.",
        "Clothes should be washed appropriately and dried properly before being stored. Items such as towels, toothbrushes, underwear, and hairbrushes should be treated as personal belongings.",
        "At school, home, and work, organizing personal belongings and keeping frequently used items clean helps create a healthier shared environment."
      ],
      keyPoint: "Clean clothing and properly maintained personal items are important parts of everyday hygiene."
    },
    {
      title: "Hygiene at Home, School, and Work",
      paragraphs: [
        "Personal hygiene is not limited to individual routines. Shared environments also need good hygiene practices to protect everyone who uses them.",
        "At home, people can keep kitchens, bathrooms, sleeping areas, and frequently touched surfaces clean. At school and work, waste should be disposed of properly and shared facilities should be kept tidy.",
        "Everyone has a role in maintaining clean surroundings. Respecting shared spaces, reporting hygiene concerns, and following established cleaning routines help prevent avoidable health problems."
      ],
      keyPoint: "Healthy environments depend on individual responsibility and cooperation."
    },
    {
      title: "Building Lifelong Hygiene Habits",
      paragraphs: [
        "Good hygiene becomes easier when it is part of a consistent daily routine. Small actions, repeated regularly, can make a meaningful difference to personal and community wellbeing.",
        "A practical routine may include morning and evening oral care, regular bathing, handwashing at important moments, clean clothing, and keeping personal spaces organized.",
        "Families, teachers, health educators, and community leaders can encourage good hygiene by sharing accurate information and making clean water and hygiene facilities accessible."
      ],
      keyPoint: "Consistent, practical hygiene habits support lifelong health and community wellbeing."
    }
  ],
     "public-health": [
    {
      title: "Introduction to Public Health",
      paragraphs: [
        "Public health is the organized effort to protect and improve the health of individuals and entire communities. Unlike healthcare that focuses mainly on treating individual patients, public health also works to prevent illness and create conditions that allow people to live healthier lives.",
        "Public health involves governments, healthcare workers, schools, families, researchers, and community organizations. Their work includes health education, disease monitoring, vaccination programmes, sanitation, and improving access to essential services.",
        "For example, a community health campaign that teaches safe water practices can help prevent illness among many households. This demonstrates how prevention and cooperation can improve community wellbeing."
      ],
      keyPoint: "Public health protects communities through prevention, education, cooperation, and accessible health services."
    },
    {
      title: "Health Promotion and Disease Prevention",
      paragraphs: [
        "Health promotion helps people gain knowledge and develop the ability to make informed decisions about their wellbeing. It encourages healthy environments, supportive policies, and positive everyday practices.",
        "Disease prevention includes activities that reduce the risk of illness. Examples include vaccination, hand hygiene, safe food handling, regular health checks, and access to accurate health information.",
        "Prevention can take place at different stages. Some activities prevent illness before it begins, while others identify health concerns early or support people already living with a condition."
      ],
      keyPoint: "Promoting health and preventing disease can reduce avoidable illness and improve quality of life."
    },
    {
      title: "Understanding Communicable Diseases",
      paragraphs: [
        "Communicable diseases are illnesses caused by infectious agents that can spread between people or through other routes. These agents include certain bacteria, viruses, parasites, and fungi.",
        "Transmission can occur through different routes, including respiratory droplets, contaminated food or water, infected surfaces, and certain insect vectors. The route depends on the particular disease.",
        "Prevention measures vary according to the disease. They may include vaccination, clean water, appropriate sanitation, hand hygiene, safe food practices, and following guidance from qualified health professionals."
      ],
      keyPoint: "Understanding how infections spread helps communities choose suitable prevention measures."
    },
    {
      title: "Understanding Non-Communicable Diseases",
      paragraphs: [
        "Non-communicable diseases are generally long-lasting conditions that do not spread directly from one person to another. Examples include diabetes, cardiovascular diseases, many cancers, and chronic respiratory diseases.",
        "Their development can involve several factors, including inherited characteristics, environmental conditions, lifestyle influences, and access to healthcare. Not every risk factor is within an individual's control.",
        "Public health responses include education, early detection, accessible treatment, supportive environments, and policies that reduce preventable risks. Respect and support are important for people living with these conditions."
      ],
      keyPoint: "Non-communicable diseases require prevention, early attention, long-term care, and community support."
    },
    {
      title: "Community Health Services",
      paragraphs: [
        "Community health services bring essential health information and support closer to the people who need them. They may include health education, maternal and child health services, vaccination, screening, and referrals.",
        "Community health workers can help connect households with healthcare facilities. They may share reliable information, encourage preventive services, and help people understand where to seek professional care.",
        "Effective community health services depend on trained workers, adequate resources, respectful communication, confidentiality, and cooperation between communities and healthcare institutions."
      ],
      keyPoint: "Accessible community health services help connect people with prevention, information, and professional care."
    },
    {
      title: "Environmental Health",
      paragraphs: [
        "Environmental health examines how surroundings influence human wellbeing. Important areas include safe drinking water, sanitation, air quality, housing, food safety, waste management, and protection from environmental hazards.",
        "Poor environmental conditions can contribute to illness and affect learning, work, and daily life. Clean water systems, proper waste disposal, good ventilation, and safe public spaces can reduce many environmental health risks.",
        "Communities, institutions, and individuals all have responsibilities. Local environmental improvements are more effective when residents participate in identifying concerns and supporting practical solutions."
      ],
      keyPoint: "A clean and safe environment is an important foundation for community health."
    },
    {
      title: "Public Health Education and Responsibility",
      paragraphs: [
        "Public health education helps people understand health information and use it to make informed decisions. Clear communication is especially important when communities face disease outbreaks, environmental concerns, or misleading information.",
        "Reliable health information should come from qualified professionals and trusted public health institutions. Information should be communicated in language that people can understand and should respect different backgrounds and circumstances.",
        "Everyone can contribute by supporting healthy environments, sharing verified information responsibly, respecting others, and using appropriate health services. Public health is strongest when individuals and institutions work together."
      ],
      keyPoint: "Accurate information, responsible decisions, and community cooperation strengthen public health."
    }
  ],
    "workplace-safety": [
    {
      title: "Introduction to Workplace Safety",
      paragraphs: [
        "Workplace safety refers to the policies, practices, and conditions that protect people from injury, illness, and avoidable risks while working. It applies to offices, schools, workshops, farms, factories, hospitals, and other working environments.",
        "A safe workplace protects employees, visitors, customers, and employers. It also supports productivity because people can concentrate better when their working environment is organized and risks are properly managed.",
        "Safety is a shared responsibility. Employers should provide suitable working conditions, information, training, and protective measures, while workers should follow safety guidance and report concerns."
      ],
      keyPoint: "Workplace safety protects people and supports a healthy, productive working environment."
    },
    {
      title: "Identifying Workplace Hazards",
      paragraphs: [
        "A workplace hazard is anything that could potentially cause injury, illness, or damage. Hazards can be physical, chemical, biological, ergonomic, or psychosocial.",
        "Examples include slippery floors, excessive noise, poor lighting, exposure to harmful substances, infectious materials, uncomfortable working positions, and excessive workplace stress.",
        "Identifying hazards requires paying attention to the environment, equipment, work activities, and experiences of workers. Employees should report unsafe conditions through the appropriate workplace channels."
      ],
      keyPoint: "Recognizing different types of hazards is an important first step in preventing workplace harm."
    },
    {
      title: "Risk Awareness and Prevention",
      paragraphs: [
        "A workplace risk is the possibility that a hazard will cause harm, together with the seriousness of the possible consequences. Risk assessment helps organizations understand which concerns require attention.",
        "Prevention begins by identifying hazards, considering who may be affected, and selecting appropriate control measures. Where possible, dangerous hazards should be removed or replaced with safer alternatives.",
        "Other controls may include physical barriers, clear procedures, training, appropriate supervision, and suitable protective equipment. Organizations should review controls regularly to ensure they remain effective."
      ],
      keyPoint: "Good risk management identifies hazards and applies suitable measures to reduce exposure to harm."
    },
    {
      title: "Safe Use of Tools and Equipment",
      paragraphs: [
        "Tools and equipment should be suitable for the task and maintained in a safe condition. Damaged, poorly maintained, or unsuitable equipment can create unnecessary workplace risks.",
        "Workers should receive appropriate instruction before using unfamiliar equipment. They should follow manufacturer guidance and workplace procedures rather than improvising or ignoring safety requirements.",
        "Defective equipment should be reported and handled according to workplace rules. Only appropriately trained and authorized people should perform maintenance or repairs."
      ],
      keyPoint: "Suitable equipment, proper training, and regular maintenance help prevent avoidable accidents."
    },
    {
      title: "Emergency Preparedness",
      paragraphs: [
        "Emergency preparedness means planning how people should respond to unexpected events such as fires, serious accidents, severe weather, or other threats to safety.",
        "Workplaces should have clear emergency procedures, accessible exits, suitable warning systems, designated assembly areas, and appropriate communication arrangements. Workers should know how to find and follow these procedures.",
        "Emergency training and practice help people understand their responsibilities. During an actual emergency, individuals should follow official instructions and avoid actions beyond their training."
      ],
      keyPoint: "Clear emergency plans and regular awareness activities help people respond more safely."
    },
    {
      title: "Workplace Health and Hygiene",
      paragraphs: [
        "Workplace health includes physical and mental wellbeing. Hygiene practices help maintain clean shared environments and reduce the spread of infections.",
        "Useful practices include maintaining clean facilities, providing safe drinking water, managing waste appropriately, keeping shared surfaces clean, and ensuring suitable ventilation where possible.",
        "Organizations should also consider workload, rest, respectful relationships, and access to appropriate support. A healthy workplace values the wellbeing and dignity of everyone."
      ],
      keyPoint: "Workplace wellbeing includes cleanliness, health protection, and respect for people."
    },
    {
      title: "Building a Safety Culture",
      paragraphs: [
        "A safety culture exists when people at every level treat safety as an important part of everyday work. It is reflected in decisions, communication, leadership, and the way concerns are handled.",
        "Managers can encourage safety by providing resources, listening to workers, responding to reports, and ensuring that procedures are understood. Workers contribute by following guidance and sharing concerns responsibly.",
        "Continuous improvement is essential. Reviewing incidents, learning from mistakes without unfair blame, and updating procedures can help organizations create safer environments over time."
      ],
      keyPoint: "A strong safety culture grows through leadership, participation, communication, and continuous improvement."
    }
  ],
     "digital-literacy": [
    {
      title: "Understanding Digital Literacy",
      paragraphs: [
        "Digital literacy is the ability to use digital devices, applications, and online services confidently, safely, and effectively. It includes finding information, evaluating sources, communicating, creating content, and solving everyday problems using technology.",
        "Digital literacy is more than knowing how to operate a phone or computer. A digitally literate person understands when technology is useful, how to choose suitable tools, and how to recognize unreliable information.",
        "These skills are valuable in education, employment, business, healthcare, and community development. For example, learners can use digital libraries, online lessons, and educational platforms to expand their knowledge."
      ],
      keyPoint: "Digital literacy combines practical technology skills, critical thinking, responsible use, and online awareness."
    },
    {
      title: "Using Digital Devices",
      paragraphs: [
        "Digital devices are electronic tools that process, store, or communicate information. Common examples include smartphones, tablets, desktop computers, laptops, digital cameras, and smart devices.",
        "Each device has different features and purposes. Computers are useful for document preparation and complex tasks, while smartphones provide portable access to communication, information, and learning applications.",
        "Users should understand basic device functions, including power controls, settings, connectivity, charging, and accessibility options. Choosing the right device depends on the task, available resources, and the user's needs."
      ],
      keyPoint: "Understanding device functions helps people choose and use technology effectively."
    },
    {
      title: "Operating Systems and Applications",
      paragraphs: [
        "An operating system is the main software that manages a digital device. It controls important functions such as files, memory, applications, user accounts, and communication with hardware.",
        "Examples include Microsoft Windows, macOS, Linux, Android, and iOS. Applications run on these systems to perform specific tasks such as writing documents, browsing the internet, editing images, and attending online meetings.",
        "Users should learn how to open and close applications, manage settings, install trusted updates, and organize their work. Understanding the difference between an operating system and an application makes digital devices easier to use."
      ],
      keyPoint: "Operating systems manage devices, while applications help users perform specific tasks."
    },
    {
      title: "Searching for Reliable Information",
      paragraphs: [
        "Digital platforms provide access to enormous amounts of information. Search engines, digital libraries, educational websites, and online databases help learners find information on almost any subject.",
        "Not every online source is accurate. Users should examine the author's qualifications, publication date, evidence, references, and purpose. Comparing information from multiple trustworthy sources can help identify misleading claims.",
        "Effective searching involves choosing specific keywords, refining search terms, and checking whether information directly answers the question. Learners should also acknowledge sources when using information in assignments or publications."
      ],
      keyPoint: "Effective digital research requires good search techniques and careful evaluation of sources."
    },
    {
      title: "Digital Communication and Collaboration",
      paragraphs: [
        "Digital communication allows people to exchange information through email, messaging platforms, video meetings, discussion forums, and social networks.",
        "Collaboration tools allow groups to share documents, organize tasks, discuss ideas, and work together even when members are in different locations. These tools are useful for school projects, professional activities, and community initiatives.",
        "Good digital communication requires clear language, respectful behaviour, appropriate sharing, and awareness of the audience. Users should respect privacy and avoid sharing another person's information without permission."
      ],
      keyPoint: "Digital tools make communication and teamwork easier when used respectfully and responsibly."
    },
    {
      title: "Creating and Managing Digital Content",
      paragraphs: [
        "Digital content includes documents, presentations, spreadsheets, photographs, videos, graphics, audio recordings, and educational materials.",
        "Creating useful content requires selecting an appropriate application, organizing information, checking accuracy, and presenting ideas clearly. Content should be suitable for its intended audience and purpose.",
        "Good file management includes meaningful filenames, organized folders, suitable formats, and regular backups. Users should also respect copyright, acknowledge original creators, and obtain permission where required."
      ],
      keyPoint: "Good digital content is accurate, organized, accessible, and respectful of other people's work."
    },
    {
      title: "Responsible and Safe Digital Citizenship",
      paragraphs: [
        "Digital citizenship means participating in online spaces responsibly, respectfully, and safely. It includes understanding online rights, responsibilities, privacy, security, and the effects of digital behaviour.",
        "Users should protect personal information, use strong and unique passwords, enable available security features, and be cautious with unexpected messages or unfamiliar links. They should also recognize that information shared online may remain accessible for a long time.",
        "Responsible digital citizens communicate respectfully, report harmful content through appropriate channels, verify information before sharing it, and consider how technology affects individuals and communities."
      ],
      keyPoint: "Responsible digital citizenship combines online safety, respect, privacy awareness, and informed participation."
    }
  ],
     "coding-fundamentals": [
    {
      title: "Introduction to Programming",
      paragraphs: [
        "Programming is the process of giving instructions to a computer so that it can perform tasks. These instructions are written using programming languages that follow specific rules and structures.",
        "Programming is used to build websites, mobile applications, business systems, educational platforms, games, and scientific tools. Languages such as JavaScript, Python, Java, and C are used for different purposes.",
        "A programmer identifies a problem, plans a solution, writes instructions, tests the result, and improves the program when necessary. Learning programming develops logical thinking, creativity, and problem-solving skills."
      ],
      keyPoint: "Programming means designing and writing instructions that help computers solve problems."
    },
    {
      title: "Understanding Algorithms and Logic",
      paragraphs: [
        "An algorithm is a clear sequence of steps used to solve a problem or complete a task. Algorithms are important because they help programmers plan what a computer should do before writing code.",
        "For example, an algorithm for calculating the average of three marks could involve receiving the three values, adding them together, dividing the total by three, and displaying the result.",
        "Programming logic helps determine whether instructions are correct and whether different situations have been considered. Flowcharts and pseudocode can help represent an algorithm before it is translated into a programming language."
      ],
      keyPoint: "Algorithms organize problem-solving into clear steps, while logic helps ensure those steps make sense."
    },
    {
      title: "Variables and Data Types",
      paragraphs: [
        "A variable is a named place used by a program to store information that may be used or changed during execution. Variables allow programs to work with information such as names, marks, prices, and calculations.",
        "Programming languages support different data types. Common examples include strings for text, numbers for numerical values, and Boolean values representing true or false.",
        "For example, a studentName variable could store the text 'Aline', while a studentScore variable could store the number 85. Choosing suitable variable names and data types makes programs easier to understand and maintain."
      ],
      keyPoint: "Variables store information, and data types describe the kind of information being stored."
    },
    {
      title: "Conditions and Decision-Making",
      paragraphs: [
        "Programs often need to make decisions based on information. Conditional statements allow a program to choose what to do when a particular condition is true or false.",
        "Common conditional structures include if, else if, and else. They allow different instructions to run depending on the situation.",
        "For example, a learning application could check whether a learner has completed all required lessons. If the condition is satisfied, the application may display a course completion message; otherwise, it can explain what remains."
      ],
      keyPoint: "Conditional statements help programs respond differently to different situations."
    },
    {
      title: "Loops and Repetition",
      paragraphs: [
        "A loop is a programming structure that repeats instructions while a particular condition is satisfied or for a specified number of times. Loops reduce unnecessary repetition in source code.",
        "Common loop structures include for loops and while loops. A for loop is useful when the number of repetitions is known, while a while loop repeats as long as its condition remains true.",
        "For example, a program could use a loop to display a list of course topics or calculate the total of several numbers. Programmers should ensure that loops have appropriate stopping conditions."
      ],
      keyPoint: "Loops make programs more efficient by repeating instructions when necessary."
    },
    {
      title: "Functions and Reusable Code",
      paragraphs: [
        "A function is a named block of code designed to perform a particular task. Functions help programmers divide large problems into smaller, manageable parts.",
        "Functions can receive inputs called parameters and may return a result. For example, a calculateAverage function could receive several marks and return their average.",
        "Reusable functions reduce duplication and make programs easier to test, understand, and maintain. Well-designed functions usually have a clear purpose and meaningful names."
      ],
      keyPoint: "Functions organize programs into reusable sections that perform specific tasks."
    },
    {
      title: "Introduction to Building Simple Projects",
      paragraphs: [
        "Programming knowledge becomes stronger when learners apply it to practical projects. A small project combines planning, variables, conditions, loops, functions, and testing to solve a real problem.",
        "Beginner projects may include a simple calculator, a quiz application, a student marks organizer, or a basic personal webpage. Each project should have a clear purpose and manageable requirements.",
        "The development process includes identifying the problem, planning the solution, writing code, testing different situations, correcting errors, and documenting the result. Learners should improve projects gradually rather than trying to build everything at once."
      ],
      keyPoint: "Small practical projects turn programming concepts into useful problem-solving skills."
    }
  ],
     "cybersecurity-awareness": [
    {
      title: "Introduction to Cybersecurity",
      paragraphs: [
        "Cybersecurity is the practice of protecting computers, mobile devices, networks, applications, and information from unauthorized access, damage, or disruption. It helps individuals and organizations use technology with greater confidence.",
        "Digital information may include personal photographs, school records, financial details, business documents, and communication. Protecting this information is important because misuse can affect privacy, finances, reputation, and daily activities.",
        "Cybersecurity involves technology, good policies, user awareness, and responsible behaviour. Everyone who uses digital devices has a role in protecting information."
      ],
      keyPoint: "Cybersecurity protects digital devices, systems, networks, and information."
    },
    {
      title: "Understanding Online Threats",
      paragraphs: [
        "An online threat is an activity or situation that could compromise digital safety. Common examples include malicious software, unauthorized account access, identity theft, deceptive websites, and attempts to steal information.",
        "Malware is software designed to perform harmful or unauthorized activities. Different forms may affect files, applications, devices, or networks. Suspicious downloads and untrusted software can increase exposure to these risks.",
        "Understanding common threats helps users recognize warning signs and make safer decisions. Keeping software updated, using trusted sources, and seeking technical support when necessary are useful protective practices."
      ],
      keyPoint: "Knowing common digital threats helps people recognize risks and respond responsibly."
    },
    {
      title: "Passwords and Account Protection",
      paragraphs: [
        "Passwords help control access to personal and organizational accounts. A strong password should be difficult to guess and should not be reused across important services.",
        "A password manager can help users create and manage unique passwords. Multi-factor authentication provides an additional layer of protection by requiring another form of verification when available.",
        "Users should never share passwords or verification codes with other people. If an account shows signs of unauthorized access, they should use the service's official recovery and security procedures."
      ],
      keyPoint: "Unique passwords, multi-factor authentication, and careful account management strengthen account security."
    },
    {
      title: "Recognizing Phishing and Online Scams",
      paragraphs: [
        "Phishing is a form of deception in which someone impersonates a trusted organization or person to persuade others to reveal information or take an unsafe action.",
        "Warning signs may include unexpected messages, unusual requests for money, suspicious attachments, spelling errors, unfamiliar website addresses, and messages that create unnecessary urgency.",
        "Users should verify requests through official communication channels rather than relying on contact details provided in suspicious messages. Unexpected requests for passwords, financial details, or verification codes should be treated with caution."
      ],
      keyPoint: "Pause and verify unexpected requests before sharing information, opening attachments, or making payments."
    },
    {
      title: "Protecting Personal Information",
      paragraphs: [
        "Personal information includes details that identify or describe an individual, such as names, contact information, photographs, school records, location information, and account details.",
        "Sharing too much information online can create privacy risks. Users should review privacy settings, limit unnecessary public sharing, and consider who can access the information they publish.",
        "Organizations that collect personal information should handle it responsibly, protect it appropriately, and follow applicable privacy requirements. Individuals should also respect other people's information and obtain permission before sharing it."
      ],
      keyPoint: "Protecting privacy means controlling what information is shared and respecting other people's data."
    },
    {
      title: "Safe Internet and Device Use",
      paragraphs: [
        "Safe device use involves maintaining software updates, downloading applications from trusted sources, and reviewing permissions before granting access to information or device features.",
        "Users should be careful when connecting to unfamiliar networks and should avoid entering sensitive information on websites they cannot verify. Important files should be backed up using reliable storage options.",
        "When using shared computers, people should avoid saving passwords, sign out of accounts after use, and ensure that personal documents are not left accessible to others."
      ],
      keyPoint: "Regular updates, trusted applications, careful browsing, and secure file management support safer device use."
    },
    {
      title: "Responsible Cybersecurity Practices",
      paragraphs: [
        "Cybersecurity is a continuous responsibility rather than a single action. New technologies and threats develop over time, so users and organizations need to keep learning and reviewing their practices.",
        "Responsible users report suspicious activity through appropriate channels, follow institutional security policies, and avoid accessing accounts or information without permission.",
        "Schools, businesses, and communities can strengthen cybersecurity through awareness programmes, clear policies, appropriate technical safeguards, and cooperation with qualified professionals when incidents occur."
      ],
      keyPoint: "Responsible cybersecurity depends on continuous learning, ethical behaviour, and shared protection."
    }
  ],
     "ai-data-literacy": [
    {
      title: "Introduction to Artificial Intelligence",
      paragraphs: [
        "Artificial Intelligence (AI) refers to computer systems designed to perform tasks that normally require aspects of human intelligence, such as recognizing patterns, understanding language, making predictions, and supporting decisions.",
        "AI is used in education, healthcare, agriculture, transportation, communication, and business. Examples include language translation, recommendation systems, voice assistants, and tools that help analyze information.",
        "AI does not think or understand the world exactly as a human does. Its outputs depend on its design, training information, and the instructions it receives. Users should therefore examine important results rather than accepting every answer automatically."
      ],
      keyPoint: "AI enables computer systems to perform tasks such as recognizing patterns, processing language, and supporting decisions."
    },
    {
      title: "Understanding Data and Information",
      paragraphs: [
        "Data consists of recorded facts, observations, measurements, or values. It may appear as numbers, words, images, audio, or other forms of digital content.",
        "Information is data that has been organized or interpreted to provide meaning. For example, individual student marks are data, while a summary showing class performance is information.",
        "Data quality matters because incomplete, inaccurate, outdated, or biased information can lead to misleading conclusions. Good data practices include checking sources, organizing records, and respecting privacy."
      ],
      keyPoint: "Data provides the raw material, while analysis and interpretation turn it into useful information."
    },
    {
      title: "How AI Systems Learn",
      paragraphs: [
        "Many AI systems use machine learning, a field in which computers identify patterns in data and use those patterns to make predictions or produce outputs.",
        "During training, a system processes examples and adjusts its internal parameters to improve its performance on a particular task. The quality and variety of training data influence what the system learns.",
        "AI systems can make mistakes when information is limited, unclear, outdated, or unrepresentative. Testing and evaluation help developers understand limitations and improve reliability."
      ],
      keyPoint: "Machine learning allows systems to identify patterns from examples, but their results depend on data and evaluation."
    },
    {
      title: "Everyday Applications of AI",
      paragraphs: [
        "AI is already part of many everyday services. Search engines use it to organize results, translation tools help people communicate across languages, and recommendation systems suggest content based on patterns in user activity.",
        "In education, AI tools can support explanations, language practice, research organization, and personalized learning. In agriculture, AI-assisted systems may help analyze weather, crops, or soil information.",
        "AI should support human judgement rather than replace it in every situation. Users should consider the importance of a decision and seek qualified human advice when the consequences are significant."
      ],
      keyPoint: "AI can assist everyday tasks across education, communication, agriculture, and many other fields."
    },
    {
      title: "Data Collection and Interpretation",
      paragraphs: [
        "Data collection is the process of gathering information for a particular purpose. Methods include surveys, observations, interviews, measurements, experiments, and digital records.",
        "After collection, data may be organized into tables, charts, or summaries. Interpretation involves looking for patterns, comparing results, considering possible explanations, and identifying limitations.",
        "For example, a school may collect attendance information and summarize it to understand patterns. The results should be interpreted carefully because a pattern alone does not always explain its cause."
      ],
      keyPoint: "Useful data analysis requires careful collection, organization, interpretation, and awareness of limitations."
    },
    {
      title: "Responsible and Ethical AI Use",
      paragraphs: [
        "Responsible AI use means applying artificial intelligence in ways that respect human dignity, privacy, fairness, safety, and accountability.",
        "AI-generated information can contain errors or reflect biases present in its training data. Users should verify important facts, acknowledge AI assistance when required, and avoid presenting generated work dishonestly as entirely their own.",
        "Personal or confidential information should not be entered into AI tools unless the service is appropriate and the user has permission to share that information. Important decisions should involve suitable human review."
      ],
      keyPoint: "Ethical AI use requires verification, privacy protection, fairness, transparency, and human responsibility."
    },
    {
      title: "The Future of AI and Human Skills",
      paragraphs: [
        "Artificial intelligence continues to influence how people study, communicate, create, and work. Future developments may change many occupations and introduce new opportunities in technology and other sectors.",
        "Human skills remain important. Creativity, critical thinking, communication, teamwork, empathy, ethical judgement, and the ability to learn continuously help people use technology effectively.",
        "Learners can prepare by building digital foundations, exploring AI tools responsibly, understanding data, and developing knowledge in their chosen fields. The aim is to use technology to solve meaningful problems and improve people's lives."
      ],
      keyPoint: "The future requires people who combine digital knowledge with creativity, critical thinking, and responsible judgement."
    }
  ],
     "entrepreneurship": [
    {
      title: "Introduction to Entrepreneurship",
      paragraphs: [
        "Entrepreneurship is the process of identifying opportunities, developing ideas, organizing resources, and creating an activity or enterprise that provides value. Entrepreneurs may establish businesses, social enterprises, or community initiatives.",
        "Entrepreneurship involves creativity, planning, responsibility, decision-making, and a willingness to learn. Entrepreneurs often work with uncertainty because customers, costs, competition, and market conditions can change.",
        "For example, a person who identifies a need for affordable educational materials may develop a small business or service to provide those materials. The idea becomes an entrepreneurial opportunity when it can offer real value to people."
      ],
      keyPoint: "Entrepreneurship turns useful ideas into organized activities that create value and address needs."
    },
    {
      title: "Identifying Business Opportunities",
      paragraphs: [
        "A business opportunity exists when a product or service can meet a real need or solve a problem for a particular group of people. Opportunities may come from changes in society, technology, customer preferences, or local conditions.",
        "Entrepreneurs can identify opportunities by observing everyday challenges, listening to potential customers, studying available services, and examining gaps in the market.",
        "An idea should be investigated before resources are committed. Research helps determine whether people need the proposed solution, whether they can access it, and whether the business can operate responsibly."
      ],
      keyPoint: "Good business opportunities begin with understanding real customer needs and practical market conditions."
    },
    {
      title: "Developing a Business Idea",
      paragraphs: [
        "A business idea describes the product or service an entrepreneur intends to provide and the value it will offer. A strong idea identifies its intended customers and explains how it addresses their needs.",
        "Developing an idea involves considering quality, price, convenience, accessibility, and the resources required. Entrepreneurs should also think about what makes their offering useful or different from existing alternatives.",
        "Ideas can be improved by discussing them with potential customers, collecting feedback, and testing a small version of the proposed product or service before expanding."
      ],
      keyPoint: "A useful business idea clearly explains what is offered, who benefits, and how the offering creates value."
    },
    {
      title: "Understanding Customers and Markets",
      paragraphs: [
        "A market consists of people or organizations that may need or purchase a particular product or service. Understanding a market helps entrepreneurs make informed decisions about what to offer and how to reach customers.",
        "Market research may involve surveys, interviews, observation, and reviewing publicly available information. It can help identify customer preferences, purchasing patterns, competing products, and possible changes in demand.",
        "Customer understanding should include more than age or location. Entrepreneurs should consider people's needs, budgets, access, preferences, and the problems they want solved."
      ],
      keyPoint: "Understanding customers and market conditions helps businesses develop relevant products and services."
    },
    {
      title: "Creating a Business Plan",
      paragraphs: [
        "A business plan is a document that explains how an enterprise intends to operate and achieve its objectives. It helps organize ideas and provides a reference for making decisions.",
        "A basic plan commonly describes the business idea, target customers, products or services, marketing approach, operational arrangements, required resources, estimated costs, and financial expectations.",
        "A business plan should be realistic and flexible. Entrepreneurs should review it when customer needs, costs, competition, or other important conditions change."
      ],
      keyPoint: "A business plan turns an idea into a practical roadmap for organizing and managing an enterprise."
    },
    {
      title: "Business Resources and Financial Planning",
      paragraphs: [
        "Businesses need resources to operate. These may include money, people, equipment, materials, technology, premises, information, and time. Entrepreneurs should identify which resources are essential and how they will be obtained.",
        "Financial planning involves estimating start-up costs, operating expenses, expected income, and the amount of money required to keep the enterprise running. A budget helps compare planned spending with available resources.",
        "Careful record-keeping supports better decisions. Entrepreneurs should distinguish business money from personal money where possible, monitor cash flow, and understand their financial responsibilities."
      ],
      keyPoint: "Responsible resource and financial planning helps businesses manage costs and maintain operations."
    },
    {
      title: "Starting, Managing, and Growing a Business",
      paragraphs: [
        "Starting a business involves preparing the necessary resources, understanding applicable registration and legal requirements, organizing operations, and introducing the product or service to customers.",
        "Good management includes customer service, quality control, staff coordination, financial records, communication, and regular evaluation of performance. Businesses should treat customers, employees, suppliers, and communities fairly.",
        "Growth should be planned carefully. Entrepreneurs can improve products, reach new customers, build partnerships, and adopt suitable technology while monitoring quality, costs, and long-term sustainability."
      ],
      keyPoint: "Successful business development requires responsible operations, customer focus, financial awareness, and continuous improvement."
    }
  ],
     "business-management": [
    {
      title: "Introduction to Business Management",
      paragraphs: [
        "Business management is the process of planning, organizing, leading, and controlling resources to achieve an organization's objectives. It helps businesses coordinate their activities and provide products or services effectively.",
        "Management involves working with people, money, equipment, information, technology, and time. Managers make decisions that influence daily operations and the long-term direction of an organization.",
        "Good management balances business performance with responsibility toward customers, employees, suppliers, and the wider community. It also encourages communication, accountability, and continuous learning."
      ],
      keyPoint: "Business management coordinates people and resources to achieve organizational goals responsibly."
    },
    {
      title: "Planning and Setting Business Objectives",
      paragraphs: [
        "Planning means deciding what an organization wants to achieve and identifying the activities and resources needed to reach its goals. It helps businesses prepare for opportunities and challenges.",
        "Business objectives should be clear, realistic, measurable, and connected to the organization's purpose. Examples include improving customer service, increasing product quality, reducing unnecessary costs, or reaching new markets.",
        "Managers should review progress regularly and adjust plans when circumstances change. Good planning considers available resources, possible risks, deadlines, and the needs of stakeholders."
      ],
      keyPoint: "Clear objectives and realistic plans give a business direction and a way to measure progress."
    },
    {
      title: "Organizing People and Resources",
      paragraphs: [
        "Organizing involves arranging tasks, responsibilities, people, and resources so that work can be completed effectively. It helps employees understand their roles and how their activities contribute to shared goals.",
        "A business may divide work into areas such as finance, marketing, customer service, production, and administration. The structure depends on the organization's size and purpose.",
        "Managers should allocate resources fairly, explain responsibilities clearly, and coordinate different teams. Effective organization reduces confusion and helps prevent unnecessary duplication of work."
      ],
      keyPoint: "Good organization ensures that responsibilities and resources are coordinated effectively."
    },
    {
      title: "Leadership and Decision-Making",
      paragraphs: [
        "Leadership is the ability to guide, support, and influence people toward shared objectives. Effective business leaders communicate clearly, listen to employees, encourage cooperation, and take responsibility for their decisions.",
        "Decision-making involves identifying a problem or opportunity, gathering relevant information, considering alternatives, and selecting a suitable course of action.",
        "Managers should consider evidence, costs, risks, fairness, and possible effects on stakeholders. Important decisions may require consultation with employees, customers, or professional advisers."
      ],
      keyPoint: "Responsible leadership combines clear direction, consultation, evidence, and accountability."
    },
    {
      title: "Marketing and Customer Relations",
      paragraphs: [
        "Marketing is the process of understanding customer needs and communicating the value of a product or service. It helps businesses connect suitable offerings with the people who may benefit from them.",
        "Marketing activities may include product development, pricing, promotion, distribution, customer research, and brand communication. Businesses should provide accurate information and avoid misleading claims.",
        "Customer relations focus on building trust through respectful communication, reliable service, fair treatment, and effective handling of feedback or complaints."
      ],
      keyPoint: "Effective marketing understands customer needs, while good customer relations build trust and loyalty."
    },
    {
      title: "Business Operations and Performance",
      paragraphs: [
        "Business operations are the daily activities involved in producing goods or delivering services. They may include purchasing materials, managing stock, serving customers, coordinating staff, and maintaining equipment.",
        "Performance measurement helps a business understand whether its activities are achieving the intended results. Useful measures may include product quality, customer satisfaction, operating costs, delivery times, and financial performance.",
        "Accurate records and regular reviews help managers identify problems and opportunities. Performance information should be used to improve operations rather than simply collect numbers."
      ],
      keyPoint: "Monitoring daily operations and measuring performance help businesses maintain quality and efficiency."
    },
    {
      title: "Business Growth and Continuous Improvement",
      paragraphs: [
        "Business growth may involve serving more customers, introducing new products, improving services, entering new markets, or developing partnerships. Growth should match the organization's capacity and long-term objectives.",
        "Continuous improvement means regularly reviewing processes and making changes that improve quality, efficiency, customer experience, or working conditions. Feedback from employees and customers can reveal areas that need attention.",
        "Sustainable growth requires responsible financial management, ethical leadership, good planning, and awareness of environmental and social responsibilities."
      ],
      keyPoint: "Strong businesses improve continuously and pursue growth that they can manage responsibly."
    }
  ],
     "accounting-basics": [
    {
      title: "Introduction to Accounting",
      paragraphs: [
        "Accounting is the process of identifying, recording, organizing, summarizing, and communicating financial information. It helps individuals and organizations understand how money and other resources are being used.",
        "Businesses use accounting information to monitor performance, plan activities, meet financial obligations, and make informed decisions. Individuals can also use basic accounting ideas to manage personal finances.",
        "Accounting records should be accurate, organized, and supported by reliable evidence. Examples of supporting documents include receipts, invoices, payment confirmations, and bank statements."
      ],
      keyPoint: "Accounting provides organized financial information that supports planning, accountability, and decision-making."
    },
    {
      title: "Understanding Assets, Liabilities, and Equity",
      paragraphs: [
        "Assets are resources controlled by an individual or organization that have economic value. Examples include cash, equipment, buildings, inventory, and money owed by customers.",
        "Liabilities are financial obligations that must be paid or settled. Examples include loans, unpaid supplier invoices, and other amounts owed to individuals or institutions.",
        "Equity represents the owner's remaining interest in the assets after liabilities are deducted. The basic accounting equation is Assets = Liabilities + Equity. This relationship helps explain the financial position of a business."
      ],
      keyPoint: "Assets are resources, liabilities are obligations, and equity represents the owner's interest."
    },
    {
      title: "Income, Expenses, and Profit",
      paragraphs: [
        "Income is money earned through business activities or other recognized sources. For a business, revenue commonly comes from selling products or providing services.",
        "Expenses are the costs incurred while operating an organization. They may include rent, salaries, transport, communication, supplies, and utilities.",
        "Profit is generally calculated by subtracting expenses from revenue for a particular period. If expenses are greater than revenue, the business records a loss. Understanding these amounts helps managers evaluate performance."
      ],
      keyPoint: "Comparing revenue and expenses helps determine whether an organization has made a profit or a loss."
    },
    {
      title: "Recording Financial Transactions",
      paragraphs: [
        "A financial transaction is an event that affects the financial position or activities of an individual or organization. Examples include receiving customer payments, purchasing supplies, paying rent, and borrowing money.",
        "Transactions should be recorded clearly and supported by appropriate documents. Records commonly include the date, description, amount, and relevant accounts affected.",
        "The double-entry accounting system records each transaction in at least two accounts, helping maintain the accounting equation. Organized records make it easier to review activities and identify errors."
      ],
      keyPoint: "Accurate transaction records provide a reliable history of financial activities."
    },
    {
      title: "Understanding Financial Statements",
      paragraphs: [
        "Financial statements summarize important accounting information and help users understand an organization's financial performance and position.",
        "The income statement reports revenue and expenses over a period. The statement of financial position, also called the balance sheet, presents assets, liabilities, and equity at a particular date.",
        "The cash flow statement explains how cash enters and leaves an organization through operating, investing, and financing activities. Reading these statements together provides a broader understanding of financial health."
      ],
      keyPoint: "Financial statements communicate an organization's performance, financial position, and cash movements."
    },
    {
      title: "Budgeting and Financial Control",
      paragraphs: [
        "A budget is a financial plan that estimates expected income and spending over a particular period. It helps organizations allocate resources, prepare for costs, and work toward financial objectives.",
        "Financial control involves comparing actual results with the budget, reviewing differences, and deciding whether corrective action is needed. This helps prevent unnecessary spending and identify changing financial needs.",
        "A useful budget should be realistic, regularly reviewed, and connected to organizational priorities. Good financial control also includes authorization procedures, clear responsibilities, and appropriate record-keeping."
      ],
      keyPoint: "Budgets guide financial planning, while financial controls help monitor how resources are used."
    },
    {
      title: "Accounting Ethics and Responsible Record-Keeping",
      paragraphs: [
        "Accounting ethics refers to the principles that guide honest, fair, and responsible handling of financial information. Important principles include integrity, objectivity, confidentiality, professional competence, and accountability.",
        "Financial records should not be deliberately falsified, hidden, or manipulated to mislead other people. Errors should be investigated and corrected through appropriate procedures.",
        "Organizations should protect confidential financial information, limit access to authorized people, retain required records, and follow applicable laws and reporting standards. Qualified accounting professionals can provide guidance on complex matters."
      ],
      keyPoint: "Ethical accounting depends on honesty, accuracy, confidentiality, and responsible financial reporting."
    }
  ],
     "project-management": [
    {
      title: "Introduction to Project Management",
      paragraphs: [
        "Project management is the process of planning, organizing, coordinating, and controlling activities to achieve a specific objective within agreed limits of time, resources, and quality.",
        "A project is a temporary activity designed to produce a particular result. Examples include organizing a school event, developing a website, constructing a building, or introducing a community learning programme.",
        "Project management helps teams understand their responsibilities, use resources effectively, manage challenges, and measure results. Projects may be small or large, but all benefit from clear planning and communication."
      ],
      keyPoint: "Project management organizes people, activities, time, and resources to achieve a defined result."
    },
    {
      title: "Defining Project Goals and Scope",
      paragraphs: [
        "A project goal explains what the project intends to achieve. Clear goals help everyone understand the desired result and provide a basis for evaluating success.",
        "Project scope describes the work included in the project and the boundaries of what will be delivered. It helps prevent confusion about responsibilities and avoids adding unrelated activities without proper agreement.",
        "A useful project definition identifies the problem, intended beneficiaries, expected deliverables, important limitations, and measures of success. Stakeholders should agree on these details before major work begins."
      ],
      keyPoint: "Clear goals and scope explain what a project must achieve and what work it includes."
    },
    {
      title: "Project Planning and Scheduling",
      paragraphs: [
        "Project planning involves identifying the activities required to produce the expected results. These activities should be arranged in a logical order, with important dependencies and deadlines identified.",
        "A project schedule shows when tasks should begin and finish, who is responsible, and which activities depend on others. Tools such as calendars, task lists, timelines, and Gantt charts can support scheduling.",
        "Good planning includes realistic time estimates and opportunities to review progress. When delays occur, project teams should communicate early and adjust the schedule responsibly."
      ],
      keyPoint: "A realistic project schedule organizes tasks, responsibilities, dependencies, and deadlines."
    },
    {
      title: "Managing Project Resources and Budgets",
      paragraphs: [
        "Projects require resources such as people, money, materials, equipment, information, and time. Resource management ensures that these are available and used appropriately.",
        "A project budget estimates the costs associated with planned activities. It may include materials, transport, labour, communication, equipment, and other necessary expenses.",
        "Project managers should monitor spending, keep financial records, obtain appropriate approvals, and compare actual costs with estimates. Changes to the budget should be documented and communicated to relevant stakeholders."
      ],
      keyPoint: "Responsible resource and budget management helps projects remain practical and financially controlled."
    },
    {
      title: "Teamwork and Project Communication",
      paragraphs: [
        "Most projects involve people with different responsibilities, experiences, and skills. Effective teamwork requires cooperation, mutual respect, clear roles, and a shared understanding of project goals.",
        "Project communication keeps team members and stakeholders informed about activities, decisions, deadlines, achievements, and challenges. Communication methods may include meetings, reports, emails, and shared project platforms.",
        "Good project leaders encourage participation, listen to concerns, clarify misunderstandings, and ensure that important decisions are communicated to the right people."
      ],
      keyPoint: "Strong teamwork and clear communication help project participants coordinate their work effectively."
    },
    {
      title: "Monitoring Risks and Project Progress",
      paragraphs: [
        "Project monitoring involves checking whether activities are being completed according to the plan. Teams can review milestones, deadlines, spending, quality, and completed deliverables.",
        "A project risk is an uncertain event or condition that could affect project objectives. Examples include unexpected costs, resource shortages, technical difficulties, delays, and changes in requirements.",
        "Risk management involves identifying possible problems, assessing their likelihood and impact, and preparing suitable responses. Teams should update stakeholders when important risks or delays arise."
      ],
      keyPoint: "Monitoring progress and managing risks help project teams identify problems before they become more difficult."
    },
    {
      title: "Project Evaluation and Completion",
      paragraphs: [
        "Project completion involves confirming that agreed deliverables have been produced, outstanding activities have been addressed, and responsibilities have been properly closed.",
        "Evaluation examines whether the project achieved its objectives, used resources responsibly, met quality expectations, and benefited its intended users. Feedback from stakeholders can reveal strengths and areas for improvement.",
        "A final project report may summarize achievements, costs, challenges, lessons learned, and recommendations. Recording these lessons helps future teams plan and deliver better projects."
      ],
      keyPoint: "Project evaluation measures results, captures lessons, and supports improvement in future projects."
    }
  ],
     "teamwork-collaboration": [
    {
      title: "Understanding Teamwork and Collaboration",
      paragraphs: [
        "Teamwork is the process of people working together toward a shared objective. Collaboration involves sharing ideas, knowledge, skills, and responsibilities to achieve results that may be difficult to accomplish individually.",
        "Teams are found in schools, workplaces, businesses, sports, and community organizations. Members may have different experiences and abilities, but they contribute toward a common purpose.",
        "Successful teamwork requires cooperation, responsibility, communication, patience, and respect. When members understand the value of working together, they can combine their strengths and achieve better results."
      ],
      keyPoint: "Teamwork brings people together to achieve shared goals through cooperation and combined effort."
    },
    {
      title: "Roles and Responsibilities in a Team",
      paragraphs: [
        "Every effective team needs clear roles and responsibilities. A role explains the contribution expected from a member, while responsibilities describe the tasks that the member is expected to complete.",
        "Team roles may include leadership, planning, communication, research, organization, record-keeping, and implementation. The exact roles depend on the team's purpose and the abilities of its members.",
        "Clear responsibilities reduce confusion and help members remain accountable. Teams should discuss expectations, agree on deadlines, and communicate when someone needs assistance."
      ],
      keyPoint: "Clearly defined roles and responsibilities help every team member understand their contribution."
    },
    {
      title: "Building Trust and Mutual Respect",
      paragraphs: [
        "Trust develops when team members demonstrate honesty, reliability, fairness, and consistency. Members should be able to depend on one another to complete agreed tasks and communicate truthfully.",
        "Mutual respect means recognizing that people have different experiences, abilities, opinions, and backgrounds. Every member should have a fair opportunity to contribute without being ignored or unfairly treated.",
        "Trust grows through keeping promises, listening carefully, respecting confidentiality where appropriate, admitting mistakes, and appreciating the contributions of others."
      ],
      keyPoint: "Trust and mutual respect create a supportive environment where team members can work confidently together."
    },
    {
      title: "Effective Team Communication",
      paragraphs: [
        "Team communication is the exchange of information, ideas, instructions, and feedback among members. Clear communication helps everyone understand the team's objectives and the progress of assigned activities.",
        "Good communication includes speaking clearly, listening actively, asking questions, sharing relevant updates, and choosing appropriate communication channels. Written records can help teams remember important decisions and responsibilities.",
        "Misunderstandings should be addressed respectfully and early. Team members should avoid making assumptions and should confirm important information when instructions or expectations are unclear."
      ],
      keyPoint: "Effective communication keeps team members informed, connected, and focused on shared objectives."
    },
    {
      title: "Cooperation and Shared Decision-Making",
      paragraphs: [
        "Cooperation occurs when team members support one another and coordinate their efforts. It requires willingness to share knowledge, contribute ideas, and help the team complete its responsibilities.",
        "Shared decision-making allows members to participate in discussions before important choices are made. Teams can compare options, consider evidence, discuss possible consequences, and agree on a suitable direction.",
        "Not every member will have the same opinion. Effective teams consider different viewpoints fairly and use agreed decision-making methods while keeping the team's objectives in focus."
      ],
      keyPoint: "Cooperation and shared decision-making help teams combine different perspectives and make informed choices."
    },
    {
      title: "Managing Team Challenges",
      paragraphs: [
        "Teams may experience challenges such as disagreements, missed deadlines, unequal participation, unclear instructions, and limited resources. Recognizing these challenges early makes them easier to address.",
        "When disagreements occur, members should listen to one another, identify the main issue, discuss possible solutions, and focus on facts rather than personal attacks. A neutral team leader may help guide the discussion.",
        "Teams should review their working methods when problems continue. Adjusting responsibilities, improving communication, offering support, and agreeing on realistic deadlines can strengthen cooperation."
      ],
      keyPoint: "Team challenges can be managed through respectful discussion, practical solutions, and shared responsibility."
    },
    {
      title: "Evaluating Team Performance",
      paragraphs: [
        "Team evaluation examines how effectively members worked together and whether they achieved their shared objectives. It helps identify successful practices and areas that need improvement.",
        "Teams can evaluate performance by reviewing completed tasks, deadlines, the quality of results, communication, participation, and feedback from relevant people.",
        "After evaluation, members should recognize achievements, discuss lessons learned, and agree on improvements for future activities. Constructive feedback helps teams become more organized and effective over time."
      ],
      keyPoint: "Regular evaluation helps teams recognize achievements, learn from challenges, and improve future performance."
    }
  ],
     "conflict-resolution": [
    {
      title: "Understanding Conflict",
      paragraphs: [
        "Conflict occurs when individuals or groups have different interests, expectations, opinions, needs, or goals. It is a normal part of human interaction and can happen in families, schools, workplaces, and communities.",
        "Conflict does not always have to produce negative results. When handled respectfully, disagreements can reveal misunderstandings, encourage new ideas, and help people improve their relationships.",
        "Conflict resolution is the process of understanding a disagreement and finding a fair and acceptable way forward. It requires patience, communication, cooperation, and willingness to consider different perspectives."
      ],
      keyPoint: "Conflict is a disagreement that can be managed constructively through understanding and respectful communication."
    },
    {
      title: "Common Causes of Conflict",
      paragraphs: [
        "Conflicts can arise from misunderstandings, poor communication, competition for limited resources, differences in values, unequal responsibilities, or unmet expectations.",
        "In schools and workplaces, disagreements may develop when instructions are unclear, tasks are not shared fairly, deadlines are missed, or people feel that their contributions are not recognized.",
        "Understanding the cause of a conflict is important before choosing a solution. People should examine the situation carefully rather than immediately blaming others or making assumptions."
      ],
      keyPoint: "Identifying the underlying causes of conflict helps people choose more appropriate solutions."
    },
    {
      title: "Recognizing Different Perspectives",
      paragraphs: [
        "A perspective is the way a person understands or interprets a situation. People's perspectives are influenced by their experiences, knowledge, responsibilities, values, and expectations.",
        "Two people may experience the same situation but understand it differently. Recognizing this helps prevent the assumption that only one person's interpretation is correct.",
        "Considering different perspectives does not require agreeing with every opinion. It means examining the reasons behind each viewpoint and treating people fairly while working toward understanding."
      ],
      keyPoint: "Understanding different perspectives helps people approach disagreements with fairness and empathy."
    },
    {
      title: "Active Listening During Disagreements",
      paragraphs: [
        "Active listening means giving full attention to another person's message, understanding what they are communicating, and responding thoughtfully. It is especially important when emotions or disagreements make communication difficult.",
        "A good listener avoids interrupting, asks respectful questions, and pays attention to both the words and the main concerns being expressed. Summarizing what someone has said can help confirm understanding.",
        "Listening does not mean automatically accepting another person's position. It creates an opportunity for everyone involved to explain their concerns and identify the actual issue."
      ],
      keyPoint: "Active listening reduces misunderstandings and helps people understand the concerns behind a disagreement."
    },
    {
      title: "Peaceful Communication and Negotiation",
      paragraphs: [
        "Peaceful communication focuses on explaining concerns without insults, threats, or unnecessary accusations. People should describe the issue clearly and explain how it affects them.",
        "Negotiation is a discussion in which people with different interests try to reach an agreement. It involves identifying priorities, considering alternatives, and finding solutions that are acceptable to the parties involved.",
        "Successful negotiation requires honesty, patience, flexibility, and respect. Agreements should be realistic, clearly understood, and fair to everyone concerned."
      ],
      keyPoint: "Respectful communication and negotiation help people reach practical agreements without escalating disagreements."
    },
    {
      title: "Mediation and Finding Solutions",
      paragraphs: [
        "Mediation is a process in which a neutral person helps people in disagreement communicate and explore possible solutions. The mediator supports the discussion without unfairly taking sides.",
        "A constructive mediation process identifies the issue, allows each person to explain their concerns, clarifies areas of agreement and disagreement, and explores possible ways forward.",
        "Solutions should address the main concerns and include clear responsibilities where necessary. In serious situations involving threats, intimidation, discrimination, or safety concerns, people should seek help from appropriate trusted authorities rather than attempting to manage the matter alone."
      ],
      keyPoint: "Mediation provides a structured and fair way to help people understand disagreements and identify possible solutions."
    },
    {
      title: "Preventing Conflict and Building Peace",
      paragraphs: [
        "Conflict prevention involves creating conditions that reduce unnecessary disagreements. Clear communication, fair rules, shared responsibilities, transparency, and respect can help prevent many common problems.",
        "Schools, workplaces, and communities can strengthen peaceful relationships by encouraging participation, addressing concerns early, providing fair opportunities, and establishing clear procedures for handling disagreements.",
        "Building peace is an ongoing responsibility. People contribute by treating others fairly, respecting differences, cooperating, resolving misunderstandings, and supporting environments where everyone can participate safely."
      ],
      keyPoint: "Peaceful communities grow through fairness, early communication, respect, and shared responsibility."
    }
  ],
     "community-development": [
    {
      title: "Introduction to Community Development",
      paragraphs: [
        "Community development is a process through which people work together to improve the social, economic, educational, environmental, and cultural conditions of the places where they live.",
        "It focuses on helping communities identify their priorities, use available resources, develop useful skills, and create opportunities for everyone to participate in improving their shared environment.",
        "Successful community development is not simply about providing assistance. It also involves building local knowledge, encouraging responsibility, strengthening cooperation, and supporting people to take part in decisions that affect their lives."
      ],
      keyPoint: "Community development empowers people to work together toward lasting improvements in their shared environment."
    },
    {
      title: "Understanding Community Needs",
      paragraphs: [
        "A community need is an issue or condition that affects people's well-being and requires attention. Examples include limited educational opportunities, inadequate sanitation, unemployment, environmental problems, and difficulties accessing essential services.",
        "Understanding community needs requires listening to residents and examining reliable information. Surveys, interviews, community meetings, observations, and available reports can help identify important concerns.",
        "Needs should be assessed fairly by considering their seriousness, the number of people affected, available resources, and possible long-term consequences. This helps communities establish realistic priorities."
      ],
      keyPoint: "Understanding community needs begins with listening to residents and gathering reliable information."
    },
    {
      title: "Community Participation and Engagement",
      paragraphs: [
        "Community participation means involving residents in identifying problems, discussing solutions, making decisions, and carrying out activities that affect their community.",
        "Engagement can take place through public meetings, volunteer activities, local associations, youth groups, educational programmes, and consultations with community representatives.",
        "Meaningful participation requires inclusion and respect. Women, young people, older people, people with disabilities, and other community members should have fair opportunities to express their views and contribute."
      ],
      keyPoint: "Inclusive community participation gives people a meaningful role in decisions and activities that affect them."
    },
    {
      title: "Identifying Local Resources and Opportunities",
      paragraphs: [
        "Community resources are the people, knowledge, skills, institutions, facilities, natural assets, and financial contributions available to support development activities.",
        "Examples include schools, health centres, libraries, local businesses, agricultural knowledge, community volunteers, cultural organizations, and environmental resources.",
        "Identifying available resources helps communities understand what they can build upon. Partnerships between residents, organizations, public institutions, and responsible businesses can create additional opportunities."
      ],
      keyPoint: "Recognizing local resources helps communities make practical use of existing strengths and opportunities."
    },
    {
      title: "Planning Community Projects",
      paragraphs: [
        "A community project is an organized activity designed to address an identified need or achieve a shared improvement. Examples include literacy programmes, environmental awareness activities, school support initiatives, and community clean-up projects.",
        "Project planning begins by defining the problem, setting objectives, identifying beneficiaries, selecting activities, assigning responsibilities, estimating costs, and establishing a realistic schedule.",
        "Community members should participate in planning so that proposed activities reflect actual needs. A clear plan also helps project organizers coordinate resources, communicate expectations, and evaluate results."
      ],
      keyPoint: "Effective community projects begin with identified needs, clear objectives, inclusive planning, and realistic resources."
    },
    {
      title: "Leadership and Sustainable Development",
      paragraphs: [
        "Community leadership involves guiding people toward shared objectives while encouraging participation, accountability, fairness, and cooperation. Good leaders listen to residents and help create opportunities for others to contribute.",
        "Sustainable development means improving people's lives while protecting resources and considering the needs of future generations. It connects social well-being, economic opportunities, and environmental responsibility.",
        "Community initiatives are more likely to last when residents develop the skills to manage them, responsibilities are shared, resources are maintained, and decisions consider long-term consequences."
      ],
      keyPoint: "Responsible leadership and sustainable planning help community improvements continue over time."
    },
    {
      title: "Monitoring Community Progress and Impact",
      paragraphs: [
        "Monitoring involves regularly checking whether community activities are being implemented according to their plans. It helps organizers identify achievements, delays, resource challenges, and areas requiring attention.",
        "Evaluation examines whether an initiative achieved its objectives and produced useful changes. Communities can consider participation levels, services delivered, feedback from residents, resources used, and improvements in living conditions.",
        "Sharing results openly builds trust and accountability. Recording lessons learned also helps community members improve future activities and make better decisions about development priorities."
      ],
      keyPoint: "Monitoring and evaluation help communities measure results, remain accountable, and improve future initiatives."
    }
  ],
    "civic-education": [
    {
      title: "Understanding Citizenship and Civic Education",
      paragraphs: [
        "Citizenship describes the legal membership of a person in a country and the relationship between that person and the state. Citizens have rights and responsibilities established by the country's laws.",
        "Civic education helps people understand how society is organized, how public institutions operate, and how individuals can contribute to peaceful and responsible communities.",
        "It encourages informed participation, respect for different opinions, awareness of public issues, and understanding of the principles that support a fair society."
      ],
      keyPoint: "Civic education develops informed, responsible, and active members of society."
    },
    {
      title: "Rights and Responsibilities of Citizens",
      paragraphs: [
        "Rights are freedoms and protections recognized by a country's constitution and laws, as well as applicable human rights agreements. They help protect human dignity, equality, and individual freedom.",
        "Responsibilities are duties that individuals are expected to fulfill within society. These may include respecting the rights of others, following applicable laws, protecting public property, and contributing positively to their communities.",
        "Rights and responsibilities are connected. People should understand their own protections while recognizing that other individuals also deserve respect, fairness, and equal treatment."
      ],
      keyPoint: "Responsible citizenship means understanding your rights while respecting the rights and freedoms of others."
    },
    {
      title: "Democracy and Good Governance",
      paragraphs: [
        "Democracy is a system of government in which people have opportunities to participate in public decision-making, directly or through representatives chosen according to established procedures.",
        "Good governance involves the responsible management of public affairs. Important principles include transparency, accountability, participation, fairness, responsiveness, and respect for the law.",
        "Democratic institutions work best when citizens have access to reliable information, public officials perform their responsibilities, and people can express their views through peaceful and lawful channels."
      ],
      keyPoint: "Democracy and good governance depend on participation, transparency, accountability, and respect for the law."
    },
    {
      title: "The Rule of Law and Justice",
      paragraphs: [
        "The rule of law means that individuals, organizations, and public authorities are subject to laws that are publicly known and applied fairly. No person should be treated as above the law.",
        "Justice involves fairness in how rights are protected, responsibilities are enforced, disputes are resolved, and people receive equal treatment under established legal procedures.",
        "Independent institutions, fair procedures, access to legal information, and respect for human rights help strengthen public confidence in the justice system."
      ],
      keyPoint: "The rule of law supports fairness by ensuring that laws apply to everyone and are administered through proper procedures."
    },
    {
      title: "Public Institutions and Their Roles",
      paragraphs: [
        "Public institutions are organizations established to perform responsibilities that serve society. They may operate at national, regional, or local levels.",
        "Different institutions have different responsibilities. These can include making laws, implementing public policies, providing education and health services, maintaining public infrastructure, protecting rights, and administering justice.",
        "Understanding institutional responsibilities helps citizens know where to obtain services, ask questions, report concerns, and seek accurate information about public decisions."
      ],
      keyPoint: "Understanding public institutions helps citizens recognize how public services and responsibilities are organized."
    },
    {
      title: "Civic Participation and Community Responsibility",
      paragraphs: [
        "Civic participation means taking part in activities and processes that influence public life and community development. It can include attending public meetings, volunteering, participating in consultations, and sharing informed opinions.",
        "Responsible participation also involves checking information before sharing it, respecting different viewpoints, protecting public resources, and using peaceful and lawful methods to express concerns.",
        "Young people can contribute through educational activities, community projects, environmental initiatives, discussions, and other constructive forms of engagement appropriate to their circumstances."
      ],
      keyPoint: "Civic participation allows people to contribute constructively to public life and community improvement."
    },
    {
      title: "Human Rights, Peace, and National Development",
      paragraphs: [
        "Human rights are basic freedoms and protections that belong to every person. They are grounded in human dignity and include principles such as equality, freedom from discrimination, education, and fair treatment.",
        "Peaceful societies are strengthened when people resolve disagreements through dialogue, respect diversity, reject discrimination, and support fair institutions.",
        "National development depends on the participation and well-being of people across society. Education, responsible leadership, economic opportunity, social cooperation, and respect for human rights all contribute to long-term progress."
      ],
      keyPoint: "Respect for human rights, peaceful cooperation, and responsible participation support inclusive national development."
    }
  ],
     "french-communication": [
    {
      title: "Introduction to French Language and Communication",
      paragraphs: [
        "French is an international language used in education, business, diplomacy, travel, culture, and everyday communication. Learning French can help people communicate with others in different countries and communities.",
        "Language learning involves developing four connected skills: listening, speaking, reading, and writing. Learners should practise these skills regularly rather than focusing only on memorizing vocabulary.",
        "Beginners can make steady progress by learning useful expressions, understanding basic pronunciation, practising short conversations, and gradually building confidence in using French."
      ],
      keyPoint: "Learning French involves developing listening, speaking, reading, and writing skills through regular practice."
    },
    {
      title: "French Greetings and Everyday Expressions",
      paragraphs: [
        "Greetings are an important part of everyday communication. In French, common greetings include Bonjour (Hello or Good morning), Bonsoir (Good evening), and Salut (Hi), which is generally informal.",
        "Polite expressions help conversations become respectful and friendly. Merci means Thank you, S'il vous plaît means Please, Excusez-moi means Excuse me, and De rien means You're welcome.",
        "The expression Comment allez-vous ? is a polite way to ask How are you? A common response is Je vais bien, merci, meaning I am fine, thank you. Learners should practise these expressions in appropriate situations."
      ],
      keyPoint: "French greetings and polite expressions help learners begin conversations naturally and respectfully."
    },
    {
      title: "Introducing Yourself and Others",
      paragraphs: [
        "Introducing yourself is a useful communication skill. The expression Je m'appelle... means My name is... For example, Je m'appelle Marie means My name is Marie.",
        "To share where you come from, you can say Je viens du Rwanda, meaning I come from Rwanda. To explain what you do, you can say Je suis étudiant or Je suis étudiante, meaning I am a student.",
        "To introduce another person, you can use Voici mon ami, meaning This is my friend, or Je vous présente..., meaning Let me introduce you to... Practising these expressions helps learners participate in simple conversations."
      ],
      keyPoint: "Simple French introductions help people share their names, backgrounds, and basic personal information."
    },
    {
      title: "French Vocabulary for Daily Life",
      paragraphs: [
        "Vocabulary is the collection of words used in a language. Building useful vocabulary helps learners understand conversations and express their ideas more clearly.",
        "Common daily vocabulary includes école (school), livre (book), maison (house), eau (water), nourriture (food), famille (family), travail (work), and ami (friend). These words can be used in many everyday situations.",
        "Learners can remember new vocabulary by grouping words according to topics, using flashcards, reading simple sentences, and practising them in conversations. Learning words in context is often more effective than memorizing isolated lists."
      ],
      keyPoint: "Learning everyday vocabulary in meaningful groups makes French easier to understand and use."
    },
    {
      title: "Basic French Grammar and Sentence Formation",
      paragraphs: [
        "Grammar provides the rules that help words form meaningful sentences. In basic French, a common sentence structure follows the order subject, verb, and complement.",
        "For example, Je parle français means I speak French. Elle lit un livre means She reads a book. These sentences show how a subject and verb work together to communicate an idea.",
        "French nouns have grammatical gender, generally classified as masculine or feminine. Articles such as un, une, le, and la help learners identify nouns and should be studied together with vocabulary."
      ],
      keyPoint: "Basic French grammar helps learners organize words into clear and meaningful sentences."
    },
    {
      title: "Reading and Understanding Simple French Texts",
      paragraphs: [
        "Reading comprehension is the ability to understand information presented in written language. French learners can begin with short dialogues, simple descriptions, notices, and educational passages.",
        "When reading, first identify familiar words and the general subject. Then examine sentence structure, look at surrounding words for clues, and use a reliable dictionary when necessary.",
        "After reading a passage, learners should identify its main idea, important details, and unfamiliar expressions. Summarizing the passage in simple French or English can help confirm understanding."
      ],
      keyPoint: "Reading regularly and identifying main ideas helps learners develop French comprehension."
    },
    {
      title: "Speaking and Writing in Everyday French",
      paragraphs: [
        "Speaking French requires practice with pronunciation, vocabulary, sentence formation, and listening. Learners can begin with short conversations about school, family, hobbies, daily activities, and familiar experiences.",
        "Writing helps organize thoughts and apply grammar. Beginners can practise writing short introductions, simple messages, descriptions, and paragraphs using vocabulary they already understand.",
        "Improvement comes through consistent practice and constructive feedback. Learners should review common mistakes, read their writing aloud, listen to spoken French, and gradually attempt more detailed conversations and texts."
      ],
      keyPoint: "Regular speaking and writing practice builds confidence and improves practical French communication."
    }
  ],
     "kinyarwanda-communication": [
    {
      title: "Introduction to Kinyarwanda Communication",
      paragraphs: [
        "Kinyarwanda is the national language of Rwanda and an important means of communication in families, schools, communities, and public life. It helps people share information, express ideas, and preserve cultural knowledge.",
        "Effective communication in Kinyarwanda involves listening, speaking, reading, and writing. These skills allow learners to participate in conversations, understand information, and communicate clearly in different situations.",
        "Learning a language also involves understanding context, respectful expressions, pronunciation, and appropriate vocabulary. Regular practice helps learners strengthen their communication skills."
      ],
      keyPoint: "Kinyarwanda communication develops the skills needed to understand and express ideas clearly in everyday life."
    },
    {
      title: "Greetings and Polite Expressions",
      paragraphs: [
        "Greetings are an important part of respectful communication. In Kinyarwanda, Muraho is a common greeting, while Mwaramutse is used for good morning and Mwiriwe is used for good afternoon or evening.",
        "Polite expressions help people communicate respectfully. Murakoze means Thank you, Ndabinginze can be used to express a polite request, and Mbabarira means Excuse me or Sorry, depending on the context.",
        "The expression Amakuru? means How are things? or What's the news? A common response is Ni meza, meaning They are good. Learners should practise these expressions in conversations with appropriate respect for the situation."
      ],
      keyPoint: "Kinyarwanda greetings and polite expressions help people communicate with courtesy and respect."
    },
    {
      title: "Introducing Yourself and Others",
      paragraphs: [
        "Introducing yourself helps establish communication with new people. You can say Nitwa... to mean My name is... For example, Nitwa Aline means My name is Aline.",
        "To explain where you come from, you can say Nkomoka mu Rwanda, meaning I come from Rwanda. To say that you are a student, you can use Ndi umunyeshuri.",
        "You can introduce another person by saying Uyu ni inshuti yanjye, meaning This is my friend. Practising introductions helps learners communicate confidently in schools, workplaces, and community activities."
      ],
      keyPoint: "Simple introductions help people share their names, backgrounds, and relationships in Kinyarwanda."
    },
    {
      title: "Everyday Vocabulary and Expressions",
      paragraphs: [
        "Vocabulary refers to the words and expressions people use to communicate. Learning common Kinyarwanda vocabulary helps learners understand everyday conversations and describe familiar situations.",
        "Useful words include ishuri (school), igitabo (book), urugo (home), amazi (water), ibiryo (food), umuryango (family), akazi (work), and inshuti (friend).",
        "Learners can improve vocabulary by grouping words into topics such as education, family, food, transport, and community life. Using new words in sentences and conversations makes them easier to remember."
      ],
      keyPoint: "Learning everyday Kinyarwanda vocabulary in context improves understanding and expression."
    },
    {
      title: "Basic Kinyarwanda Grammar and Sentence Formation",
      paragraphs: [
        "Grammar refers to the rules that organize words into meaningful sentences. Understanding basic grammar helps learners express ideas accurately and understand how different parts of a sentence work together.",
        "For example, Ndi umunyeshuri means I am a student, and Ndiga Ikinyarwanda means I study Kinyarwanda. These examples show how words combine to communicate complete ideas.",
        "Kinyarwanda uses noun classes, which influence agreement between nouns and other words in a sentence. Learners should gradually study common noun classes, verb forms, and agreement patterns through examples and guided exercises."
      ],
      keyPoint: "Understanding basic grammar and noun-class agreement helps learners form clearer Kinyarwanda sentences."
    },
    {
      title: "Reading and Understanding Kinyarwanda Texts",
      paragraphs: [
        "Reading comprehension means understanding information presented in written language. Learners can begin with short Kinyarwanda stories, conversations, notices, descriptions, and educational passages.",
        "During reading, identify familiar words, examine sentence structure, and use the surrounding information to understand unfamiliar expressions. Reading aloud can also help learners become more familiar with written language.",
        "After reading, identify the main idea, important details, and the purpose of the text. Summarizing what you have read helps develop understanding and improves the ability to communicate information."
      ],
      keyPoint: "Regular reading and comprehension practice strengthen understanding of written Kinyarwanda."
    },
    {
      title: "Speaking and Writing in Everyday Kinyarwanda",
      paragraphs: [
        "Speaking allows learners to communicate ideas, ask questions, explain experiences, and participate in discussions. Everyday practice can begin with conversations about family, education, work, interests, and community activities.",
        "Writing helps learners organize information and communicate messages clearly. Beginners can practise writing introductions, short descriptions, personal messages, and simple paragraphs.",
        "Good communication improves through regular practice, reading, listening, and constructive feedback. Learners should review their sentence structure, expand their vocabulary, and practise expressing ideas in different situations."
      ],
      keyPoint: "Consistent speaking and writing practice develops confidence and effective everyday Kinyarwanda communication."
    }
  ],
    "professional-writing": [
    {
      title: "Introduction to Professional Writing",
      paragraphs: [
        "Professional writing is the use of clear, organized, and appropriate written language in educational, workplace, business, and official situations. It helps people communicate information, explain ideas, and document important activities.",
        "Examples include emails, reports, letters, proposals, meeting minutes, instructions, and project documents. Each type of writing serves a particular purpose and may follow specific conventions.",
        "Good professional writing should be accurate, relevant, respectful, and easy to understand. Writers should organize information carefully and choose a tone that suits the intended reader and situation."
      ],
      keyPoint: "Professional writing communicates information clearly, accurately, and appropriately for a particular purpose."
    },
    {
      title: "Understanding Purpose and Audience",
      paragraphs: [
        "The purpose of writing explains why a document is being prepared. A writer may want to inform, explain, request, persuade, record an activity, or recommend a particular action.",
        "The audience refers to the people who will read the document. Readers may have different levels of knowledge, responsibilities, expectations, and interests, so writers should consider what information they need.",
        "Before writing, identify the objective, the intended readers, the main message, and the appropriate tone. This preparation helps prevent unnecessary information and makes the document more useful."
      ],
      keyPoint: "Understanding purpose and audience helps writers choose relevant content, suitable language, and an appropriate tone."
    },
    {
      title: "Building Clear and Well-Structured Sentences",
      paragraphs: [
        "A sentence is a group of words that expresses a complete thought. Clear sentences help readers understand information without unnecessary effort or confusion.",
        "Professional sentences should use correct grammar, appropriate vocabulary, and logical word order. Writers should avoid unnecessary repetition, vague expressions, and overly complicated language.",
        "Different sentence structures can be used to explain facts, ask questions, give instructions, or connect related ideas. Reviewing sentence length and punctuation helps make written communication easier to follow."
      ],
      keyPoint: "Clear sentences use correct grammar and precise language to communicate complete ideas."
    },
    {
      title: "Writing Effective Paragraphs",
      paragraphs: [
        "A paragraph develops one main idea through related sentences. It usually begins with a topic sentence, continues with supporting explanations or examples, and may end with a concluding sentence.",
        "Good paragraphs follow a logical order. Writers can arrange information chronologically, compare ideas, explain causes and effects, or present a problem followed by possible solutions.",
        "Each paragraph should remain focused on its main idea. Appropriate transitions help connect sentences and paragraphs, creating a document that readers can follow easily."
      ],
      keyPoint: "Effective paragraphs develop one main idea using relevant supporting details and logical organization."
    },
    {
      title: "Professional Emails and Letters",
      paragraphs: [
        "Professional emails and letters are used to communicate with colleagues, institutions, customers, teachers, and other contacts. They should be respectful, direct, and organized according to their purpose.",
        "A professional email commonly includes a clear subject line, appropriate greeting, brief introduction, organized message, polite closing, and the sender's name. A formal letter may also include addresses, a date, and a formal subject or reference.",
        "Writers should check recipient details, attachments, spelling, tone, and clarity before sending a message. Sensitive or important information should be shared carefully with the appropriate people."
      ],
      keyPoint: "Professional emails and letters require clear organization, respectful language, and careful review."
    },
    {
      title: "Reports, Proposals, and Formal Documents",
      paragraphs: [
        "A report presents information about an activity, situation, investigation, or result. Reports commonly include a title, introduction, main findings, discussion, conclusion, and recommendations where appropriate.",
        "A proposal describes a suggested project, activity, or solution. It may explain the problem, objectives, planned activities, required resources, schedule, expected outcomes, and methods of evaluation.",
        "Formal documents should use headings, consistent formatting, reliable information, and appropriate evidence. Writers should distinguish confirmed facts from opinions and ensure that recommendations are supported by the information presented."
      ],
      keyPoint: "Reports and proposals organize evidence and ideas so readers can understand findings and evaluate recommendations."
    },
    {
      title: "Editing, Proofreading, and Responsible Writing",
      paragraphs: [
        "Editing improves the quality of a document by checking organization, clarity, accuracy, tone, and relevance. It may involve rewriting sentences, removing repetition, or rearranging paragraphs.",
        "Proofreading is the final review for spelling, grammar, punctuation, formatting, names, dates, and other small errors. Reading a document slowly or reviewing a printed copy can help identify mistakes.",
        "Responsible writing requires honesty, respect for privacy, proper acknowledgement of sources, and avoidance of plagiarism. Writers should verify information, use quotations appropriately, and make sure their documents do not misrepresent other people's work."
      ],
      keyPoint: "Responsible editing and proofreading improve accuracy, readability, originality, and professional credibility."
    }
  ],
     "modern-agriculture": [
    {
      title: "Introduction to Modern Agriculture",
      paragraphs: [
        "Agriculture is the practice of cultivating crops, raising animals, and managing natural resources to produce food, raw materials, and other useful products. It supports livelihoods, trade, employment, and economic development.",
        "Modern agriculture combines traditional knowledge with scientific research, improved farming methods, technology, and better resource management. Its purpose is to improve productivity while responding to changing environmental and economic conditions.",
        "Agriculture includes crop production, livestock farming, horticulture, agroforestry, and other activities. Understanding these areas helps learners appreciate how food and agricultural products move from farms to consumers."
      ],
      keyPoint: "Modern agriculture combines knowledge, technology, and responsible resource management to improve agricultural production."
    },
    {
      title: "Soil Health and Land Preparation",
      paragraphs: [
        "Soil is a natural resource that supports plant growth by providing water, nutrients, and physical support for roots. Healthy soil contains minerals, organic matter, air, water, and living organisms.",
        "Land preparation involves assessing the condition of a farming area and preparing it appropriately for production. Depending on the soil and farming system, activities may include clearing unwanted vegetation responsibly, preparing planting areas, and improving soil structure.",
        "Soil health can be maintained through organic matter management, suitable crop rotation, erosion prevention, careful water management, and responsible use of agricultural inputs. Farmers should consider local soil conditions before choosing farming practices."
      ],
      keyPoint: "Healthy soil and appropriate land preparation provide a strong foundation for productive and sustainable farming."
    },
    {
      title: "Crop Production and Farm Management",
      paragraphs: [
        "Crop production involves growing plants for food, animal feed, commercial products, and other uses. Common crops include cereals, vegetables, fruits, legumes, and root crops.",
        "Successful crop management requires selecting suitable crop varieties, understanding local growing conditions, planning planting activities, monitoring plant health, and managing water and nutrients appropriately.",
        "Farmers should also keep records of planting dates, input use, crop development, harvest quantities, and expenses. These records help evaluate performance and make informed decisions during future growing seasons."
      ],
      keyPoint: "Effective crop production depends on suitable crop selection, careful management, and regular monitoring."
    },
    {
      title: "Livestock Production and Animal Care",
      paragraphs: [
        "Livestock production involves raising animals for food, income, agricultural work, and other useful products. Common livestock include cattle, goats, sheep, pigs, poultry, and other domesticated animals.",
        "Responsible animal care requires appropriate housing, clean water, suitable nutrition, hygiene, regular health monitoring, and access to qualified veterinary support when needed.",
        "Good livestock management also considers animal welfare, breeding decisions, disease prevention, record-keeping, and responsible waste management. Healthy animals and appropriate care contribute to reliable agricultural production."
      ],
      keyPoint: "Responsible livestock production combines proper nutrition, animal welfare, hygiene, and appropriate veterinary care."
    },
    {
      title: "Agricultural Technology and Innovation",
      paragraphs: [
        "Agricultural technology includes tools, equipment, scientific methods, and digital systems that support farming activities. Examples include irrigation systems, improved storage facilities, farm machinery, weather information services, and digital farm records.",
        "Innovation helps farmers respond to challenges such as changing weather, limited resources, crop losses, and increasing demand for food. Technology can improve efficiency, support better decisions, and reduce unnecessary resource use.",
        "Before adopting a new technology, farmers should consider its cost, suitability, maintenance requirements, accessibility, and expected benefits. Training and reliable information help ensure that technology is used effectively."
      ],
      keyPoint: "Appropriate agricultural technology can improve productivity, resource management, and farming decisions."
    },
    {
      title: "Harvesting, Storage, and Marketing",
      paragraphs: [
        "Harvesting is the process of collecting mature crops or agricultural products at an appropriate stage. Correct timing and careful handling help maintain quality and reduce losses.",
        "Storage protects agricultural products from moisture, pests, contamination, and unnecessary damage. Suitable storage conditions depend on the type of product and may involve clean facilities, appropriate packaging, ventilation, or temperature control.",
        "Marketing connects farmers with buyers and consumers. Farmers benefit from understanding product quality, market demand, transportation, pricing, record-keeping, and reliable sales arrangements."
      ],
      keyPoint: "Careful harvesting, appropriate storage, and effective marketing help protect agricultural value and reduce post-harvest losses."
    },
    {
      title: "Sustainable Agriculture and Food Security",
      paragraphs: [
        "Sustainable agriculture aims to produce food and other agricultural products while protecting natural resources and supporting the well-being of farming communities. It considers environmental, economic, and social responsibilities.",
        "Food security exists when people have reliable access to sufficient, safe, and nutritious food that meets their needs. Agricultural productivity, household income, food distribution, storage, and environmental conditions all influence food security.",
        "Sustainable practices include protecting soil and water, maintaining biodiversity, reducing avoidable food waste, adapting to climate conditions, and supporting responsible farming decisions. Cooperation among farmers, researchers, institutions, and communities strengthens long-term food systems."
      ],
      keyPoint: "Sustainable agriculture protects resources while supporting reliable food production and food security."
    }
  ],
     "sustainable-farming": [
    {
      title: "Understanding Sustainable Farming",
      paragraphs: [
        "Sustainable farming is an approach to agriculture that produces food and other useful products while protecting natural resources and supporting the long-term well-being of farmers and communities.",
        "It considers three connected areas: environmental protection, economic viability, and social responsibility. Farming should maintain productive land, provide reasonable livelihoods, and consider the needs of present and future generations.",
        "Sustainable farming methods depend on local conditions. Farmers should consider soil type, climate, available water, biodiversity, market opportunities, and the resources they can manage responsibly."
      ],
      keyPoint: "Sustainable farming balances agricultural production, environmental protection, and long-term community well-being."
    },
    {
      title: "Soil Conservation and Soil Fertility",
      paragraphs: [
        "Soil conservation involves protecting soil from erosion, nutrient loss, compaction, and other forms of degradation. Healthy soil supports plant growth and contributes to reliable agricultural production.",
        "Soil fertility refers to the soil's ability to provide essential nutrients for plant development. Organic matter, suitable nutrient management, soil organisms, and appropriate farming practices all contribute to fertility.",
        "Farmers can protect soil through practices such as maintaining vegetation cover, using suitable crop rotations, applying organic matter responsibly, and minimizing unnecessary soil disturbance. The most appropriate method depends on local conditions."
      ],
      keyPoint: "Protecting soil structure, organic matter, and nutrients supports productive land over the long term."
    },
    {
      title: "Water Conservation and Efficient Irrigation",
      paragraphs: [
        "Water is essential for crop growth, livestock, soil processes, and agricultural activities. Responsible water management helps farms remain productive while reducing pressure on rivers, lakes, groundwater, and other sources.",
        "Irrigation supplies water to crops when rainfall is insufficient. Different systems, including drip and sprinkler irrigation, can help farmers manage water according to crop requirements and local conditions.",
        "Water conservation also involves monitoring water use, maintaining irrigation equipment, collecting rainwater where appropriate, protecting water sources, and reducing unnecessary losses. Safe water management should consider both agricultural needs and community access."
      ],
      keyPoint: "Efficient water management supports crop production while protecting limited water resources."
    },
    {
      title: "Crop Rotation and Diversified Farming",
      paragraphs: [
        "Crop rotation is the practice of growing different crops on the same land in a planned sequence across different growing periods. It can help maintain soil fertility and reduce the buildup of certain crop pests and diseases.",
        "Diversified farming involves producing more than one type of crop or combining different agricultural activities. Examples include growing cereals alongside legumes, integrating suitable trees, or combining crop and livestock production.",
        "Farmers should select crop combinations based on local climate, soil conditions, household needs, available markets, and production costs. Planning diversity carefully can improve resilience and create additional income opportunities."
      ],
      keyPoint: "Crop rotation and farm diversification can improve soil management, reduce production risks, and strengthen resilience."
    },
    {
      title: "Organic Farming and Natural Inputs",
      paragraphs: [
        "Organic farming is an agricultural approach that emphasizes ecological processes, biodiversity, and responsible soil management. Its practices vary according to recognized standards and the farming system being used.",
        "Natural agricultural inputs may include compost, properly managed animal manure, plant residues, and other approved materials. These can contribute organic matter and nutrients when selected and applied appropriately.",
        "Organic production requires careful management of soil fertility, pests, diseases, and product quality. Farmers should understand local guidance and certification requirements before marketing products as officially organic."
      ],
      keyPoint: "Organic farming emphasizes ecological processes and responsible use of suitable natural inputs."
    },
    {
      title: "Climate-Smart Agricultural Practices",
      paragraphs: [
        "Climate-smart agriculture helps farming systems respond to climate-related challenges while supporting productivity and responsible environmental management.",
        "Useful approaches may include selecting suitable crop varieties, improving water efficiency, protecting soil, diversifying production, using reliable weather information, and planning for seasonal changes.",
        "Farmers should assess local climate risks and seek advice from agricultural extension services and reliable research institutions. Practices that work well in one location may not be appropriate in another."
      ],
      keyPoint: "Climate-smart farming combines adaptation, productivity, and responsible resource management."
    },
    {
      title: "Building Long-Term Sustainable Farms",
      paragraphs: [
        "A sustainable farm requires planning that considers production costs, income, soil and water conditions, market access, labour, and the well-being of people involved in farming.",
        "Farm records help farmers monitor production, expenses, sales, resource use, and changes in farm performance. Reviewing these records supports informed decisions and helps identify opportunities for improvement.",
        "Long-term sustainability also depends on learning, cooperation, responsible innovation, and passing useful knowledge to future farmers. By evaluating results regularly, farmers can improve practices while protecting the resources on which agriculture depends."
      ],
      keyPoint: "Long-term farm sustainability depends on careful planning, responsible resource use, reliable records, and continuous improvement."
    }
  ],
     "soil-water-conservation": [
    {
      title: "Introduction to Soil and Water Conservation",
      paragraphs: [
        "Soil and water are essential natural resources that support agriculture, ecosystems, human health, and economic activities. Their responsible management is important for maintaining productive land and healthy communities.",
        "Soil and water conservation refers to practices that protect these resources from degradation, pollution, excessive loss, and unsustainable use. It helps maintain soil fertility, protect water sources, and support reliable agricultural production.",
        "Conservation requires cooperation among farmers, communities, institutions, and environmental professionals. Understanding local conditions helps people choose appropriate methods for protecting land and water."
      ],
      keyPoint: "Soil and water conservation protects essential natural resources and supports long-term environmental and agricultural sustainability."
    },
    {
      title: "Understanding Soil Types and Properties",
      paragraphs: [
        "Soil is a natural material made up of mineral particles, organic matter, water, air, and living organisms. Its properties influence plant growth, water movement, nutrient availability, and land management.",
        "Common soil texture groups include sandy, silty, and clay soils. Sandy soils generally have larger particles and drain quickly, while clay soils have very fine particles and can retain more water. Loamy soils contain a mixture of particle sizes.",
        "Soil properties also include structure, depth, acidity, organic matter, and fertility. Farmers and land managers can use soil observations and appropriate testing to understand local conditions before choosing conservation practices."
      ],
      keyPoint: "Understanding soil texture, structure, and fertility helps people manage land according to its characteristics."
    },
    {
      title: "Causes and Effects of Soil Erosion",
      paragraphs: [
        "Soil erosion is the movement of soil particles from one place to another through natural forces such as flowing water and wind. Human activities can increase erosion when land is not managed responsibly.",
        "Contributing factors include the removal of vegetation, unsuitable cultivation practices, overgrazing, poorly managed drainage, and construction activities that leave soil exposed.",
        "Erosion can reduce fertile topsoil, damage agricultural productivity, increase sediment in rivers, affect water quality, and contribute to land degradation. Understanding its causes is the first step toward prevention."
      ],
      keyPoint: "Soil erosion removes valuable soil and can damage farms, water systems, and surrounding ecosystems."
    },
    {
      title: "Soil Protection and Erosion Prevention",
      paragraphs: [
        "Soil protection involves maintaining soil cover, preserving organic matter, and managing land in ways that reduce erosion and degradation. Vegetation plays an important role because plant roots help hold soil together.",
        "Conservation practices may include maintaining grass cover, planting suitable trees, using mulch, practising crop rotation, establishing appropriate terraces, and managing livestock grazing responsibly.",
        "The effectiveness of each method depends on slope, rainfall, soil type, vegetation, and land use. Farmers should seek appropriate local guidance before introducing major changes to their land."
      ],
      keyPoint: "Vegetation cover, suitable farming practices, and responsible land management help prevent soil erosion."
    },
    {
      title: "Water Resources and Their Importance",
      paragraphs: [
        "Water resources include rivers, lakes, wetlands, groundwater, springs, rainfall, and other sources of freshwater. These resources support people, agriculture, industries, and natural ecosystems.",
        "Freshwater is essential for drinking, sanitation, food production, livestock, and economic activities. Healthy water systems also provide habitats for plants and animals and help maintain environmental balance.",
        "Water resources can be affected by pollution, excessive extraction, poor waste management, deforestation, and changing climate conditions. Protecting them requires responsible use and effective environmental management."
      ],
      keyPoint: "Healthy water resources support human well-being, agricultural production, and functioning ecosystems."
    },
    {
      title: "Water Conservation and Watershed Management",
      paragraphs: [
        "Water conservation involves using water efficiently, reducing unnecessary waste, protecting water quality, and maintaining reliable supplies for future needs.",
        "A watershed is an area of land where rainfall and other water flow toward a common river, lake, or water outlet. Activities across a watershed can influence water quality and availability downstream.",
        "Watershed management may include protecting vegetation, restoring degraded areas, reducing pollution, maintaining appropriate drainage, and encouraging cooperation among communities that share water resources."
      ],
      keyPoint: "Water conservation and watershed protection help maintain clean and reliable water supplies."
    },
    {
      title: "Integrated Soil and Water Management",
      paragraphs: [
        "Integrated soil and water management considers the relationship between land, vegetation, rainfall, farming, and water systems. Decisions about one resource can affect the condition of the others.",
        "For example, maintaining vegetation can reduce soil erosion, improve water infiltration, and help protect nearby streams. Responsible farming and land-use planning can also reduce pollution and preserve productive land.",
        "Successful integrated management requires local knowledge, environmental monitoring, community participation, and long-term planning. Reviewing results helps communities improve conservation efforts as conditions change."
      ],
      keyPoint: "Integrated management protects soil and water together through coordinated and responsible land-use decisions."
    }
  ],
     "climate-environment": [
    {
      title: "Introduction to Climate and the Environment",
      paragraphs: [
        "Climate describes the usual weather conditions of a place over a long period, while weather refers to daily conditions such as rainfall, temperature, and wind. The environment includes the air, water, land, plants, animals, and human communities around us.",
        "Climate and the environment are closely connected. Temperature and rainfall influence farming, water availability, ecosystems, and people's daily activities. Understanding these connections helps communities make informed decisions.",
        "Environmental education encourages people to understand nature, recognize environmental challenges, and take responsible actions that support healthy surroundings."
      ],
      keyPoint: "Climate describes long-term weather patterns, while the environment includes all living and non-living surroundings."
    },
    {
      title: "Understanding Weather and Climate Patterns",
      paragraphs: [
        "Weather conditions change from day to day. Common elements include temperature, rainfall, humidity, wind, and cloud cover. These conditions influence transport, farming, outdoor activities, and daily planning.",
        "Climate patterns describe the usual weather conditions experienced in a region over many years. Different regions may have different rainfall seasons, temperatures, and dry periods.",
        "Learning about weather and climate patterns helps people understand seasonal changes, prepare for different conditions, and make better decisions about natural resources."
      ],
      keyPoint: "Weather describes short-term atmospheric conditions, while climate describes patterns over many years."
    },
    {
      title: "Understanding Climate Change",
      paragraphs: [
        "Climate change refers to long-term changes in Earth's temperatures and weather patterns. Some changes happen naturally, but recent global warming is mainly driven by human activities that release greenhouse gases.",
        "Burning fossil fuels, deforestation, and certain industrial and agricultural activities contribute to greenhouse gas emissions. These gases trap additional heat in the atmosphere.",
        "Understanding the causes of climate change helps learners recognize why responsible energy use, forest protection, and sustainable development matter."
      ],
      keyPoint: "Human activities that increase greenhouse gas emissions are the main cause of recent global warming."
    },
    {
      title: "Environmental Pollution and Its Effects",
      paragraphs: [
        "Pollution occurs when harmful substances or waste enter the environment. Common forms include air pollution, water pollution, soil pollution, and excessive noise.",
        "Pollution can affect human health, damage ecosystems, reduce soil quality, and make water unsafe. Poor waste disposal, vehicle emissions, and some industrial activities are common sources.",
        "Preventing pollution requires responsible waste management, cleaner practices, public awareness, and cooperation between individuals, communities, businesses, and institutions."
      ],
      keyPoint: "Preventing pollution protects people, wildlife, natural resources, and the quality of the environment."
    },
    {
      title: "Biodiversity and Ecosystem Protection",
      paragraphs: [
        "Biodiversity means the variety of living things, including plants, animals, and microorganisms. Ecosystems are communities of living organisms interacting with one another and with their physical surroundings.",
        "Biodiversity supports food production, pollination, clean water, healthy soils, and ecological balance. Different species often depend on one another for survival.",
        "Habitat destruction, pollution, overuse of natural resources, and climate change can threaten biodiversity. Protecting habitats and using resources responsibly helps conserve ecosystems."
      ],
      keyPoint: "Biodiversity supports healthy ecosystems and provides important benefits to people and nature."
    },
    {
      title: "Environmental Conservation and Sustainable Resources",
      paragraphs: [
        "Environmental conservation means protecting natural resources and using them responsibly. Important resources include forests, water, soil, minerals, and wildlife.",
        "Sustainable resource use considers both present needs and the needs of future generations. Examples include reducing unnecessary waste, saving water, protecting trees, and choosing reusable materials where practical.",
        "Conservation works best when individuals, schools, communities, organizations, and governments cooperate to protect the environment."
      ],
      keyPoint: "Sustainable resource use protects nature while supporting the needs of present and future generations."
    },
    {
      title: "Climate Action and Community Responsibility",
      paragraphs: [
        "Climate action includes efforts to reduce greenhouse gas emissions and prepare communities for climate-related challenges. These efforts can take place at household, school, community, national, and international levels.",
        "Communities can support climate action through tree protection, responsible energy use, environmental education, proper waste management, and sustainable land practices.",
        "Every learner can contribute by understanding environmental issues, sharing reliable information, participating in suitable community activities, and encouraging responsible decisions."
      ],
      keyPoint: "Climate action is a shared responsibility that combines environmental protection, informed decisions, and community cooperation."
    }
  ],
     "food-systems-agribusiness": [
    {
      title: "Introduction to Food Systems and Agribusiness",
      paragraphs: [
        "A food system includes all the activities involved in producing, processing, transporting, selling, preparing, and consuming food. It also includes the people, organizations, resources, and services that support these activities.",
        "Agribusiness refers to business activities connected to agriculture and food production. It includes farming, supplying agricultural inputs, processing products, storage, transportation, and marketing.",
        "Understanding food systems helps learners see how agriculture supports livelihoods, nutrition, employment, trade, and community development."
      ],
      keyPoint: "Food systems connect agricultural production with processing, distribution, markets, and consumers."
    },
    {
      title: "Agricultural Production and Food Supply",
      paragraphs: [
        "Agricultural production involves growing crops and raising animals to provide food and other useful products. Farmers make decisions about land, seeds, water, labour, equipment, and suitable production methods.",
        "Food supply depends on several connected factors, including weather, soil conditions, farming knowledge, available resources, storage facilities, and transportation.",
        "Reliable production and responsible farm management help communities maintain food availability and support stable livelihoods."
      ],
      keyPoint: "Good agricultural production and farm management contribute to a reliable food supply."
    },
    {
      title: "Food Processing and Value Addition",
      paragraphs: [
        "Food processing involves changing agricultural products into forms that are easier to store, transport, prepare, or consume. Examples include milling grains, drying fruits, pasteurizing milk, and packaging food.",
        "Value addition means improving a product so that it provides greater usefulness or market value. This may involve better processing, packaging, quality control, or presentation.",
        "Small businesses and cooperatives can create employment and reduce post-harvest losses by processing agricultural products responsibly."
      ],
      keyPoint: "Food processing and value addition can improve product quality, usefulness, market opportunities, and income."
    },
    {
      title: "Food Storage, Distribution, and Markets",
      paragraphs: [
        "Food storage helps maintain product quality between harvest and consumption. Appropriate storage conditions depend on the type of food and may involve clean facilities, suitable temperatures, and protection from pests and moisture.",
        "Food distribution moves products from farms and processing facilities to markets, shops, institutions, and households. Transportation and reliable supply networks help connect producers with consumers.",
        "Markets bring buyers and sellers together. Understanding customer needs, product quality, pricing, and market demand helps agricultural businesses make informed decisions."
      ],
      keyPoint: "Effective storage, distribution, and marketing help food reach consumers safely and efficiently."
    },
    {
      title: "Agricultural Entrepreneurship and Business Planning",
      paragraphs: [
        "Agricultural entrepreneurship involves identifying business opportunities in farming, food processing, agricultural services, and related activities. Entrepreneurs look for ways to meet customer needs while managing available resources.",
        "A business plan describes the product or service, target customers, resources required, expected costs, possible income, and business goals. It helps an entrepreneur organize ideas before making major decisions.",
        "A realistic plan should consider local conditions, market demand, competition, risks, and the knowledge or support needed to operate responsibly."
      ],
      keyPoint: "A practical business plan helps agricultural entrepreneurs evaluate opportunities and organize resources."
    },
    {
      title: "Agricultural Finance and Cooperative Development",
      paragraphs: [
        "Agricultural finance involves managing money used for farming and related businesses. Common financial needs include purchasing seeds, tools, equipment, animal feed, transportation, and storage services.",
        "Cooperatives allow producers or business members to work together toward shared goals. Members may combine resources, exchange knowledge, access markets, and improve their ability to negotiate.",
        "Responsible financial records, transparent decisions, realistic budgets, and shared accountability help agricultural businesses and cooperatives remain sustainable."
      ],
      keyPoint: "Sound financial management and cooperation can strengthen agricultural businesses and producer communities."
    },
    {
      title: "Sustainable Food Systems and Agribusiness Growth",
      paragraphs: [
        "A sustainable food system provides reliable and nutritious food while protecting natural resources, supporting fair opportunities, and considering the needs of future generations.",
        "Agribusinesses can contribute through responsible production, reduced food waste, safe processing, efficient transportation, fair business practices, and environmentally aware decisions.",
        "Innovation, education, technology, and cooperation can help food systems respond to changing needs. Successful growth should consider economic value, community well-being, and environmental responsibility."
      ],
      keyPoint: "Sustainable food systems balance food availability, economic opportunity, social well-being, and environmental protection."
    }
  ],
    "workplace-ethics": [
    {
      title: "Introduction to Workplace Ethics",
      paragraphs: [
        "Workplace ethics are the moral principles and values that guide how people behave in professional environments. They help individuals make responsible decisions and treat colleagues, customers, and members of the public fairly.",
        "Important ethical values include honesty, respect, responsibility, fairness, confidentiality, and accountability. These values apply in offices, schools, businesses, organizations, and other workplaces.",
        "Understanding workplace ethics helps learners prepare for professional responsibilities and build trust with the people they work with."
      ],
      keyPoint: "Workplace ethics guide responsible, respectful, honest, and fair professional behaviour."
    },
    {
      title: "Professional Conduct and Responsibility",
      paragraphs: [
        "Professional conduct refers to the way individuals behave while carrying out their duties. It includes following appropriate rules, communicating respectfully, completing assigned work, and considering how decisions affect others.",
        "Responsibility means understanding one's duties and taking ownership of assigned tasks. Responsible workers ask for clarification when needed, communicate difficulties early, and make reasonable efforts to complete their work.",
        "Professional behaviour also means accepting feedback, learning from mistakes, and treating every person with dignity regardless of their position."
      ],
      keyPoint: "Professional conduct requires respect, responsibility, reliability, and ownership of one's duties."
    },
    {
      title: "Honesty, Integrity, and Accountability",
      paragraphs: [
        "Honesty means communicating truthfully and presenting information accurately. Integrity means following ethical principles even when nobody is checking or when an easier but dishonest choice is available.",
        "Accountability means accepting responsibility for decisions and their results. It includes explaining actions honestly, correcting errors, and following agreed procedures.",
        "These values build confidence between colleagues, employers, customers, and the wider community. They also help organizations maintain reliable records and fair practices."
      ],
      keyPoint: "Honesty, integrity, and accountability create trust and support responsible professional decisions."
    },
    {
      title: "Respect, Diversity, and Inclusion at Work",
      paragraphs: [
        "A respectful workplace recognizes that people have different experiences, abilities, backgrounds, opinions, and ways of communicating. Everyone deserves to be treated fairly and with dignity.",
        "Inclusion means creating an environment where people can participate, contribute ideas, and access appropriate opportunities without unfair discrimination or exclusion.",
        "Workers can support inclusion by listening carefully, avoiding harmful assumptions, using respectful language, and addressing unfair treatment through appropriate workplace channels."
      ],
      keyPoint: "Respect and inclusion help create fair workplaces where different people can contribute and succeed."
    },
    {
      title: "Confidentiality and Responsible Information Use",
      paragraphs: [
        "Confidentiality means protecting information that should not be shared without proper permission. Workplaces may handle personal details, customer records, financial information, internal documents, and other sensitive material.",
        "Responsible information use involves accessing only information needed for one's duties, storing records appropriately, and sharing information only with authorized people.",
        "Digital communication also requires care. Workers should check recipients, protect account access, and avoid sharing private workplace information through unsuitable channels."
      ],
      keyPoint: "Protecting confidential information is an important responsibility in both physical and digital workplaces."
    },
    {
      title: "Time Management, Teamwork, and Workplace Rules",
      paragraphs: [
        "Reliable workers manage their time, understand priorities, attend agreed activities, and communicate when delays occur. Planning tasks helps prevent unnecessary confusion and supports consistent performance.",
        "Teamwork requires cooperation, clear communication, respect for different responsibilities, and willingness to contribute toward shared goals.",
        "Workplace rules and policies explain expected standards, procedures, safety responsibilities, and reporting arrangements. Understanding them helps individuals work consistently and responsibly."
      ],
      keyPoint: "Good time management, teamwork, and respect for workplace policies support effective professional performance."
    },
    {
      title: "Ethical Decision-Making and Professional Growth",
      paragraphs: [
        "Ethical decision-making involves recognizing a problem, identifying the people affected, considering relevant rules and values, and evaluating possible choices before acting.",
        "When a difficult situation occurs, individuals should seek reliable guidance, use appropriate reporting channels, and avoid decisions that could unfairly harm others or misuse their responsibilities.",
        "Professional growth involves continuing to learn, reflecting on experience, accepting constructive feedback, and improving skills. Ethical behaviour should remain part of that development throughout a person's career."
      ],
      keyPoint: "Ethical decisions and continuous learning help individuals build trustworthy and successful careers."
    }
  ],
    "cv-job-applications": [
    {
      title: "Introduction to CVs and Job Applications",
      paragraphs: [
        "A curriculum vitae (CV) is a document that presents a person's education, skills, experience, achievements, and relevant activities. It helps employers understand whether an applicant may be suitable for an opportunity.",
        "A job application is a formal expression of interest in a particular position. It may require a CV, application letter, completed form, certificates, or other requested documents.",
        "A strong application is clear, honest, relevant to the opportunity, and carefully prepared. Even learners without formal employment experience can present education, projects, volunteering, and transferable skills."
      ],
      keyPoint: "A CV and job application communicate a person's relevant qualifications and suitability for an opportunity."
    },
    {
      title: "Understanding Your Skills and Qualifications",
      paragraphs: [
        "Before preparing a CV, identify the knowledge, abilities, and experiences that relate to the opportunity. These may include communication, teamwork, problem-solving, digital skills, languages, and technical abilities.",
        "Qualifications include formal education, professional training, certificates, and other relevant learning achievements. Experience may come from employment, school projects, volunteering, internships, or community activities.",
        "Describe your abilities accurately. Avoid exaggerating qualifications or claiming experience you do not have. Employers value clear and truthful information."
      ],
      keyPoint: "Identify relevant skills, qualifications, and experiences before writing your application."
    },
    {
      title: "Preparing a Clear and Professional CV",
      paragraphs: [
        "A professional CV usually contains contact information, a short professional profile, education, relevant experience, skills, and references when requested. The order may vary depending on the opportunity and local expectations.",
        "Use clear headings, consistent formatting, readable fonts, and concise descriptions. Place the most relevant information where an employer can find it easily.",
        "Check spelling, dates, contact details, and document layout before submitting. A well-organized CV should make your qualifications easy to understand without unnecessary information."
      ],
      keyPoint: "A clear, accurate, and well-organized CV helps employers understand an applicant's strengths."
    },
    {
      title: "Writing Effective Application Letters",
      paragraphs: [
        "An application letter introduces the applicant and explains interest in a specific position or opportunity. It should connect the applicant's relevant abilities and experience to the employer's needs.",
        "A good letter normally includes a professional greeting, the purpose of writing, relevant qualifications, a brief explanation of suitability, and a polite closing.",
        "Avoid sending exactly the same letter to every employer without reviewing the opportunity. Use accurate details, professional language, and a clear structure."
      ],
      keyPoint: "An effective application letter explains why the applicant is interested and how their qualifications relate to the opportunity."
    },
    {
      title: "Finding Opportunities and Understanding Job Advertisements",
      paragraphs: [
        "Job advertisements provide information about available positions, responsibilities, required qualifications, application procedures, and deadlines. Reading them carefully helps applicants decide whether an opportunity matches their skills and goals.",
        "Look for the employer's identity, official contact details, required documents, eligibility conditions, location, and submission instructions. Compare these requirements with your own qualifications before applying.",
        "Use reliable sources such as official organization websites, recognized employment services, school career offices, and trusted professional networks. Be cautious of advertisements that request unusual payments or unnecessary personal information."
      ],
      keyPoint: "Carefully review job requirements and verify opportunities through reliable sources before applying."
    },
    {
      title: "Submitting Applications and Following Up",
      paragraphs: [
        "Before submitting an application, confirm that every required document is included and that files use suitable formats and clear names. Follow the employer's instructions about online portals, email, or physical submission.",
        "When applying by email, use a professional subject line, a short respectful message, and the correct attachments. Check the recipient's address and open the attachments to confirm they are the intended documents.",
        "After submission, keep a record of the opportunity, application date, and any communication. If appropriate, send a polite follow-up after a reasonable period without repeatedly contacting the employer."
      ],
      keyPoint: "Careful submission and professional follow-up help keep an application process organized."
    },
    {
      title: "Building a Strong Professional Profile",
      paragraphs: [
        "A professional profile is the way a person presents their qualifications, interests, achievements, and professional goals. It may appear in a CV, portfolio, professional networking page, or application documents.",
        "Keep professional information accurate and consistent across different platforms. Share suitable examples of projects, certificates, and achievements while respecting privacy and confidentiality.",
        "A strong profile develops over time through education, practical experience, volunteering, continuous learning, and responsible professional conduct. Review it regularly as your skills and goals change."
      ],
      keyPoint: "A strong professional profile communicates genuine skills, achievements, and career direction."
    }
  ],
    "interview-skills": [
    {
      title: "Introduction to Interviews and Their Purpose",
      paragraphs: [
        "An interview is a structured conversation used by an employer, school, organization, or institution to learn more about an applicant. It gives both sides an opportunity to discuss qualifications, expectations, and suitability.",
        "Interviews may take place in person, by telephone, or through video calls. They can include general questions, technical questions, practical tasks, or discussions about previous experiences.",
        "Understanding the purpose of an interview helps applicants prepare relevant examples, communicate clearly, and demonstrate their knowledge and abilities."
      ],
      keyPoint: "An interview allows applicants to demonstrate their suitability while learning more about an opportunity."
    },
    {
      title: "Preparing for an Interview",
      paragraphs: [
        "Good preparation begins with understanding the organization, the opportunity, and the responsibilities involved. Review the job or programme description and identify the qualifications and skills that are most relevant.",
        "Prepare examples that demonstrate communication, teamwork, problem-solving, responsibility, and other important abilities. Think about how your education, projects, volunteering, or previous experiences relate to the opportunity.",
        "Plan your travel or online connection, choose appropriate professional clothing, organize requested documents, and allow enough time. Preparation can help reduce uncertainty and improve confidence."
      ],
      keyPoint: "Research, relevant examples, organized documents, and practical planning are important parts of interview preparation."
    },
    {
      title: "Answering Common Interview Questions",
      paragraphs: [
        "Interviewers may ask applicants to introduce themselves, explain their interests, describe their strengths, or discuss why they applied. Answers should be relevant, truthful, and connected to the opportunity.",
        "For questions about experience, use a clear structure: explain the situation, describe your responsibility, discuss the action you took, and share the result or lesson learned.",
        "Avoid memorizing long speeches. Understand your main points so that you can respond naturally and adjust your answers to the question being asked."
      ],
      keyPoint: "Strong interview answers are clear, honest, relevant, and supported by suitable examples."
    },
    {
      title: "Professional Communication and Body Language",
      paragraphs: [
        "Professional communication involves speaking clearly, listening carefully, using respectful language, and responding directly to questions. Organizing your thoughts before answering can make communication easier to follow.",
        "Non-verbal communication includes facial expressions, posture, gestures, and eye contact where culturally appropriate. These signals should support respectful and attentive interaction.",
        "During an interview, remain polite and focused. If a question is unclear, ask the interviewer to explain it rather than guessing what they mean."
      ],
      keyPoint: "Clear speech, attentive listening, and respectful non-verbal communication support a professional interview."
    },
    {
      title: "Participating in Online and Panel Interviews",
      paragraphs: [
        "Online interviews require preparation of the device, internet connection, microphone, camera, and meeting platform. Choose a quiet and suitable location where interruptions are less likely.",
        "Panel interviews involve more than one interviewer. Address the person asking the question while remaining attentive to the other panel members. Organize your answers so everyone can follow your explanation.",
        "For either format, follow instructions, communicate respectfully, and remain calm if technical or communication difficulties occur. Ask for a question to be repeated when necessary."
      ],
      keyPoint: "Different interview formats require practical preparation, clear communication, and professional behaviour."
    },
    {
      title: "Asking Questions and Handling Difficult Questions",
      paragraphs: [
        "Interviews are also an opportunity for applicants to understand the role, organization, working arrangements, expectations, and learning opportunities. Prepare a few relevant questions before the interview.",
        "Some questions may be challenging because they involve limited experience, unfamiliar topics, or personal development areas. Respond honestly and explain how you are learning or improving.",
        "If you do not know an answer, avoid inventing information. Explain what you understand, acknowledge what you still need to learn, and show willingness to develop."
      ],
      keyPoint: "Thoughtful questions and honest responses demonstrate curiosity, maturity, and a willingness to learn."
    },
    {
      title: "Interview Follow-Up and Continuous Improvement",
      paragraphs: [
        "After an interview, thank the interviewer for the opportunity and follow any communication instructions provided. A brief professional message may be appropriate when contact details and circumstances allow.",
        "Record questions that were difficult, areas where you communicated well, and skills you would like to improve. Use this reflection to prepare more effectively for future interviews.",
        "An unsuccessful application does not remove the value of the experience. Feedback, practice, additional learning, and preparation can strengthen future performance."
      ],
      keyPoint: "Reflecting on interviews and improving through practice helps build long-term professional confidence."
    }
  ],
     "research-study-skills": [
    {
      title: "Introduction to Research and Study Skills",
      paragraphs: [
        "Research and study skills help learners find information, understand ideas, organize knowledge, and communicate what they have learned. They are useful in primary and secondary education, technical training, university, professional development, and everyday life.",
        "Research involves asking questions, gathering relevant information, examining evidence, and developing conclusions. Study skills help learners understand, remember, and apply information effectively.",
        "Developing these skills encourages independent learning, curiosity, critical thinking, and responsible use of information."
      ],
      keyPoint: "Research and study skills help learners investigate questions, understand information, and develop independent knowledge."
    },
    {
      title: "Setting Learning Goals and Managing Study Time",
      paragraphs: [
        "Learning goals describe what a learner wants to understand or achieve. Clear goals make studying more purposeful and help learners identify what to work on first.",
        "A study timetable can organize lessons, reading, assignments, revision, and breaks. Dividing large tasks into smaller activities makes progress easier to manage.",
        "Study plans should be realistic and flexible. Reviewing progress regularly helps learners adjust their priorities when circumstances or learning needs change."
      ],
      keyPoint: "Clear learning goals and realistic study schedules help learners organize their time and monitor progress."
    },
    {
      title: "Effective Reading and Note-Taking",
      paragraphs: [
        "Effective reading involves identifying the purpose of a text, recognizing its main ideas, understanding important details, and connecting new information with existing knowledge.",
        "Note-taking helps learners record useful information in their own words. Methods may include headings, short summaries, tables, diagrams, and concept maps.",
        "Good notes should be organized, accurate, and easy to review. Copying everything without understanding it is less useful than identifying and explaining the most important ideas."
      ],
      keyPoint: "Purposeful reading and organized note-taking improve understanding and make revision more useful."
    },
    {
      title: "Finding and Evaluating Reliable Information",
      paragraphs: [
        "Research information can come from textbooks, academic publications, educational websites, official reports, libraries, and other sources. Different questions may require different types of evidence.",
        "Evaluate a source by considering who created it, when it was published, what evidence it provides, whether it is relevant, and whether other trustworthy sources support its claims.",
        "Be cautious with information that has no clear author, makes exaggerated claims, or cannot be verified. Comparing multiple reliable sources helps reduce misunderstandings."
      ],
      keyPoint: "Reliable research depends on relevant evidence, trustworthy sources, and careful evaluation of information."
    },
    {
      title: "Research Questions, Methods, and Evidence",
      paragraphs: [
        "A research question identifies the issue or topic a learner wants to investigate. A focused question makes it easier to decide what information is needed and which sources may be useful.",
        "Research methods are ways of collecting information. Depending on the topic, they may include reviewing publications, observing situations, conducting interviews with appropriate permission, or using surveys.",
        "Evidence should be recorded accurately and interpreted carefully. Learners should distinguish facts, opinions, assumptions, and personal interpretations when explaining findings."
      ],
      keyPoint: "Good research begins with a focused question and uses suitable methods to collect and interpret evidence."
    },
    {
      title: "Academic Writing, Referencing, and Avoiding Plagiarism",
      paragraphs: [
        "Academic writing presents information in a clear, organized, and evidence-based way. A written assignment or report usually has an introduction, a main discussion, and a conclusion.",
        "Referencing identifies the sources used in research. It allows readers to locate the original information and recognize the work of authors and researchers.",
        "Plagiarism occurs when someone presents another person's words, ideas, or work as their own without appropriate acknowledgment. Use quotations, paraphrasing, and citations responsibly, and follow the referencing style required by your institution."
      ],
      keyPoint: "Responsible academic writing uses clear explanations, appropriate references, and proper acknowledgment of other people's work."
    },
    {
      title: "Revision, Critical Thinking, and Lifelong Learning",
      paragraphs: [
        "Revision is the process of reviewing and practising previously studied material. Useful approaches include summarizing topics, answering practice questions, explaining concepts aloud, and revisiting areas that need more attention.",
        "Critical thinking means examining information carefully, asking questions, comparing explanations, identifying assumptions, and reaching conclusions based on evidence rather than accepting every claim immediately.",
        "Lifelong learning means continuing to develop knowledge and skills beyond formal education. Curiosity, reflection, reliable research, and consistent study habits help learners adapt to new challenges throughout life."
      ],
      keyPoint: "Regular revision, critical thinking, and continued learning support long-term educational and professional development."
    }
  ],
};
const learnLoopCourses = [

  // =====================================================
  // 1. HEALTH AND SAFETY
  // =====================================================
  {
    slug: "first-aid",
    category: "Health and Safety",
    title: "First Aid Awareness",
    description: "Understand basic emergency awareness, personal safety, and how to seek appropriate help.",
    icon: "🩺",
    educationLevels: ["General Learning", "Secondary Education", "TVET / Technical Education", "University / Higher Education"],
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
    slug: "personal-hygiene",
    category: "Health and Safety",
    title: "Personal Hygiene and Disease Prevention",
    description: "Learn healthy hygiene habits and understand how common illnesses can be prevented.",
    icon: "🧼",
    educationLevels: ["Primary Education", "Secondary Education", "General Learning"],
  topics: [
  "Understanding Personal Hygiene",
  "Hand Hygiene and Germ Prevention",
  "Oral Hygiene and Dental Care",
  "Skin, Hair, and Body Care",
  "Clean Clothing and Personal Items",
  "Hygiene at Home, School, and Work",
  "Building Lifelong Hygiene Habits"
    ]
  },
  {
    slug: "nutrition-healthy-living",
    category: "Health and Safety",
    title: "Nutrition and Healthy Living",
    description: "Understand balanced nutrition, healthy routines, and informed everyday health choices.",
    icon: "🥗",
    educationLevels: ["Primary Education", "Secondary Education", "General Learning"],
    topics: [
      "Introduction to Nutrition",
      "Understanding Food Groups",
      "Balanced Meals and Healthy Eating",
      "Water and Hydration",
      "Physical Activity and Everyday Wellbeing",
      "Sleep and Healthy Routines",
      "Making Informed Health Choices"
    ]
  },
  {
    slug: "public-health",
    category: "Health and Safety",
    title: "Public Health Awareness",
    description: "Explore community health, disease prevention, and the importance of health education.",
    icon: "🏥",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Public Health",
      "Health in Families and Communities",
      "Disease Prevention and Health Education",
      "Vaccination Awareness",
      "Environmental Health",
      "Accessing Reliable Health Information",
      "Community Participation in Health"
    ]
  },
  {
    slug: "workplace-safety",
    category: "Health and Safety",
    title: "Workplace and Community Safety",
    description: "Recognize common safety concerns and understand responsible prevention practices.",
    icon: "🦺",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Safety Principles",
      "Recognizing Common Hazards",
      "Understanding Safety Signs",
      "Personal Protective Equipment Awareness",
      "Fire and Emergency Safety Awareness",
      "Reporting Safety Concerns",
      "Building a Culture of Safety"
    ]
  },

  // =====================================================
  // 2. TECHNOLOGY AND DIGITAL SKILLS
  // =====================================================
  {
    slug: "computer-skills",
    category: "Technology and Digital Skills",
    title: "Computer Skills",
    description: "Develop practical computer knowledge for education, communication, and work.",
    icon: "💻",
    educationLevels: ["Primary Education", "Secondary Education", "TVET / Technical Education", "General Learning"],
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
    slug: "digital-literacy",
    category: "Technology and Digital Skills",
    title: "Internet and Digital Literacy",
    description: "Learn to navigate online information, digital platforms, and everyday internet tools.",
    icon: "🌐",
    educationLevels: ["Primary Education", "Secondary Education", "General Learning"],
    topics: [
      "Understanding the Internet",
      "Using Web Browsers and Search Engines",
      "Finding Reliable Online Information",
      "Digital Communication Tools",
      "Online Learning Platforms",
      "Digital Footprints and Online Responsibility",
      "Evaluating Information and Avoiding Misinformation"
    ]
  },
  {
    slug: "coding-fundamentals",
    category: "Technology and Digital Skills",
    title: "Coding Fundamentals",
    description: "Discover programming concepts and learn how digital applications are developed.",
    icon: "👨‍💻",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Programming",
      "Understanding Algorithms",
      "Variables and Data Types",
      "Conditions and Decision-Making",
      "Loops and Repetition",
      "Functions and Reusable Code",
      "Introduction to Building Simple Programs"
    ]
  },
  {
    slug: "cybersecurity-awareness",
    category: "Technology and Digital Skills",
    title: "Cybersecurity Awareness",
    description: "Understand digital risks and learn responsible ways to protect information and accounts.",
    icon: "🔐",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education", "General Learning"],
    topics: [
      "Introduction to Cybersecurity",
      "Understanding Personal Information",
      "Strong Passwords and Account Protection",
      "Recognizing Online Scams",
      "Safe Browsing and Downloads",
      "Privacy and Digital Security",
      "Responsible Reporting of Online Threats"
    ]
  },
  {
    slug: "ai-data-literacy",
    category: "Technology and Digital Skills",
    title: "Artificial Intelligence and Data Literacy",
    description: "Explore artificial intelligence, data, responsible use, and modern digital opportunities.",
    icon: "🤖",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Artificial Intelligence",
      "Understanding Data and Information",
      "How AI Systems Are Used",
      "Introduction to Data Analysis",
      "Checking AI-Generated Information",
      "Ethics, Privacy, and Responsible AI",
      "AI Skills for Education and Work"
    ]
  },

  // =====================================================
  // 3. BUSINESS AND ENTREPRENEURSHIP
  // =====================================================
  {
    slug: "financial-literacy",
    category: "Business and Entrepreneurship",
    title: "Financial Literacy",
    description: "Understand budgeting, saving, spending, and responsible financial decisions.",
    icon: "💰",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education", "General Learning"],
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
    slug: "entrepreneurship",
    category: "Business and Entrepreneurship",
    title: "Entrepreneurship Fundamentals",
    description: "Discover how business ideas become useful products, services, and sustainable ventures.",
    icon: "🚀",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Entrepreneurship",
      "Identifying Problems and Opportunities",
      "Developing a Business Idea",
      "Understanding Customers and Markets",
      "Planning Resources and Costs",
      "Introduction to Business Models",
      "Starting and Improving a Small Venture"
    ]
  },
  {
    slug: "business-management",
    category: "Business and Entrepreneurship",
    title: "Business Management",
    description: "Build an understanding of planning, organizing, managing, and improving businesses.",
    icon: "🏢",
    educationLevels: ["TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Business Management",
      "Planning Business Activities",
      "Organizing People and Resources",
      "Understanding Business Operations",
      "Customer Service and Relationships",
      "Monitoring Business Performance",
      "Responsible and Sustainable Management"
    ]
  },
  {
    slug: "accounting-basics",
    category: "Business and Entrepreneurship",
    title: "Accounting Basics",
    description: "Understand basic financial records, transactions, budgets, and business reporting.",
    icon: "📊",
    educationLevels: ["TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Accounting",
      "Understanding Business Transactions",
      "Income and Expenses",
      "Assets and Liabilities",
      "Introduction to Financial Records",
      "Understanding Basic Financial Statements",
      "Accuracy and Responsibility in Record-Keeping"
    ]
  },
  {
    slug: "project-management",
    category: "Business and Entrepreneurship",
    title: "Project Management Fundamentals",
    description: "Learn how to plan, organize, monitor, and evaluate projects effectively.",
    icon: "📋",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Project Management",
      "Defining Project Goals",
      "Planning Tasks and Timelines",
      "Managing Resources and Budgets",
      "Team Coordination and Communication",
      "Monitoring Risks and Progress",
      "Project Evaluation and Reporting"
    ]
  },

  // =====================================================
  // 4. LEADERSHIP AND SOCIAL DEVELOPMENT
  // =====================================================
  {
    slug: "leadership",
    category: "Leadership and Social Development",
    title: "Leadership",
    description: "Build responsibility, teamwork, decision-making, and leadership skills.",
    icon: "👥",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education", "General Learning"],
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
    slug: "teamwork-collaboration",
    category: "Leadership and Social Development",
    title: "Teamwork and Collaboration",
    description: "Develop cooperation, shared responsibility, and effective group-work skills.",
    icon: "🤝",
    educationLevels: ["Primary Education", "Secondary Education", "TVET / Technical Education", "General Learning"],
    topics: [
      "Understanding Teamwork",
      "Roles and Responsibilities in a Team",
      "Respecting Different Ideas",
      "Sharing Tasks Fairly",
      "Collaborative Problem-Solving",
      "Building Trust and Accountability",
      "Evaluating Team Performance"
    ]
  },
  {
    slug: "conflict-resolution",
    category: "Leadership and Social Development",
    title: "Conflict Resolution",
    description: "Understand disagreements and develop respectful approaches to resolving conflict.",
    icon: "⚖️",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Conflict",
      "Common Causes of Disagreement",
      "Listening to Different Perspectives",
      "Respectful Communication During Conflict",
      "Negotiation and Fair Solutions",
      "When to Seek Mediation or Support",
      "Preventing Repeated Conflicts"
    ]
  },
  {
    slug: "community-development",
    category: "Leadership and Social Development",
    title: "Community Development",
    description: "Explore community needs, participation, cooperation, and positive social change.",
    icon: "🌍",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Communities",
      "Identifying Community Needs",
      "Community Participation",
      "Planning Community Activities",
      "Volunteering and Social Responsibility",
      "Working with Community Organizations",
      "Measuring Community Impact"
    ]
  },
  {
    slug: "civic-education",
    category: "Leadership and Social Development",
    title: "Civic Education and Responsible Citizenship",
    description: "Understand citizenship, rights, responsibilities, and constructive participation in society.",
    icon: "🏛️",
    educationLevels: ["Secondary Education", "University / Higher Education", "General Learning"],
    topics: [
      "Understanding Citizenship",
      "Rights and Responsibilities",
      "Respect for Laws and Institutions",
      "Participation in Community Life",
      "Equality and Respect for Others",
      "Responsible Public Dialogue",
      "Contributing to Positive Social Change"
    ]
  },

  // =====================================================
  // 5. LANGUAGES AND COMMUNICATION
  // =====================================================
  {
    slug: "english",
    category: "Languages and Communication",
    title: "English Communication",
    description: "Improve grammar, vocabulary, reading, writing, and everyday speaking.",
    icon: "📘",
    educationLevels: ["Primary Education", "Secondary Education", "TVET / Technical Education", "General Learning"],
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
    slug: "french-communication",
    category: "Languages and Communication",
    title: "French Communication",
    description: "Develop foundational French vocabulary, grammar, reading, and conversation skills.",
    icon: "🇫🇷",
    educationLevels: ["Primary Education", "Secondary Education", "General Learning"],
    topics: [
      "French Greetings and Introductions",
      "Everyday Vocabulary",
      "Numbers, Dates, and Time",
      "Basic French Sentence Structure",
      "Common Verbs and Expressions",
      "Reading and Understanding Short Texts",
      "Everyday French Conversations"
    ]
  },
  {
    slug: "kinyarwanda-communication",
    category: "Languages and Communication",
    title: "Kinyarwanda Communication",
    description: "Strengthen Kinyarwanda reading, writing, vocabulary, and effective communication.",
    icon: "🇷🇼",
    educationLevels: ["Primary Education", "Secondary Education", "General Learning"],
    topics: [
      "Kinyarwanda Communication Foundations",
      "Vocabulary and Expressions",
      "Sentence Construction",
      "Reading Comprehension",
      "Writing Clear Messages",
      "Respectful Everyday Conversations",
      "Communicating Ideas Confidently"
    ]
  },
  {
    slug: "communication",
    category: "Languages and Communication",
    title: "Communication Skills",
    description: "Express ideas clearly and work effectively with other people.",
    icon: "🗣️",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education", "General Learning"],
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
    slug: "professional-writing",
    category: "Languages and Communication",
    title: "Professional Writing",
    description: "Learn to prepare clear, organized, and appropriate written communication.",
    icon: "✍️",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Principles of Clear Writing",
      "Writing Professional Emails",
      "Formal and Informal Language",
      "Paragraph and Document Organization",
      "Reports and Summaries",
      "Editing and Proofreading",
      "Responsible Use of Sources and References"
    ]
  },

  // =====================================================
  // 6. AGRICULTURE AND ENVIRONMENT
  // =====================================================
  {
    slug: "modern-agriculture",
    category: "Agriculture and Environment",
    title: "Introduction to Modern Agriculture",
    description: "Explore agricultural systems, farming knowledge, and responsible innovation.",
    icon: "🌱",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Modern Agriculture",
      "Types of Agricultural Systems",
      "Crop Production Fundamentals",
      "Livestock Production Awareness",
      "Agricultural Tools and Technology",
      "Farm Planning and Record-Keeping",
      "Innovation in Agriculture"
    ]
  },
  {
    slug: "sustainable-farming",
    category: "Agriculture and Environment",
    title: "Sustainable Farming",
    description: "Understand farming practices that support productivity and environmental care.",
    icon: "🌾",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Introduction to Sustainable Agriculture",
      "Soil Health and Conservation",
      "Water-Smart Farming",
      "Crop Diversity and Rotation",
      "Responsible Use of Farm Inputs",
      "Reducing Agricultural Waste",
      "Building Resilient Farming Systems"
    ]
  },
  {
    slug: "soil-water-conservation",
    category: "Agriculture and Environment",
    title: "Soil and Water Conservation",
    description: "Learn why soil and water resources matter and how they can be protected.",
    icon: "💧",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Soil Resources",
      "Soil Types and Basic Properties",
      "Causes of Soil Erosion",
      "Soil Conservation Principles",
      "Understanding Water Resources",
      "Water Conservation Practices",
      "Protecting Land and Water for the Future"
    ]
  },
  {
    slug: "climate-environment",
    category: "Agriculture and Environment",
    title: "Climate Change and Environmental Awareness",
    description: "Understand environmental challenges, climate impacts, and sustainable choices.",
    icon: "🌍",
    educationLevels: ["Primary Education", "Secondary Education", "TVET / Technical Education", "General Learning"],
    topics: [
      "Introduction to the Environment",
      "Understanding Climate and Weather",
      "Introduction to Climate Change",
      "Climate Impacts on Communities",
      "Biodiversity and Ecosystems",
      "Waste Management and Pollution Prevention",
      "Environmental Responsibility and Action"
    ]
  },
  {
    slug: "food-systems-agribusiness",
    category: "Agriculture and Environment",
    title: "Food Systems and Agribusiness",
    description: "Explore how food is produced, processed, distributed, and connected to business.",
    icon: "🚜",
    educationLevels: ["TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Food Systems",
      "Food Production and Supply",
      "Food Quality and Safety Awareness",
      "Storage and Post-Harvest Management",
      "Agricultural Markets and Customers",
      "Introduction to Agribusiness",
      "Innovation and Opportunities in Food Systems"
    ]
  },

  // =====================================================
  // 7. PROFESSIONAL AND CAREER DEVELOPMENT
  // =====================================================
  {
    slug: "career-readiness",
    category: "Professional and Career Development",
    title: "Career Readiness",
    description: "Prepare for opportunities in education, employment, and community life.",
    icon: "🎯",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Discovering Your Strengths",
      "Setting Personal and Career Goals",
      "Preparing a CV or Résumé",
      "Writing a Professional Application",
      "Interview Preparation",
      "Workplace Ethics and Reliability",
      "Continuous Learning and Career Growth"
    ]
  },
  {
    slug: "workplace-ethics",
    category: "Professional and Career Development",
    title: "Workplace Ethics and Professionalism",
    description: "Develop responsible workplace conduct, integrity, and professional habits.",
    icon: "💼",
    educationLevels: ["TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Workplace Professionalism",
      "Integrity and Honesty at Work",
      "Respect and Professional Conduct",
      "Time Management and Reliability",
      "Confidentiality and Responsibility",
      "Working with Rules and Policies",
      "Continuous Professional Improvement"
    ]
  },
  {
    slug: "cv-job-applications",
    category: "Professional and Career Development",
    title: "CV Writing and Job Applications",
    description: "Learn how to present your education, skills, and experience in applications.",
    icon: "📄",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding CVs and Résumés",
      "Identifying Skills and Experience",
      "Organizing Education and Qualifications",
      "Writing a Clear Professional Profile",
      "Preparing Application Letters",
      "Checking and Improving Applications",
      "Adapting Applications to Opportunities"
    ]
  },
  {
    slug: "interview-skills",
    category: "Professional and Career Development",
    title: "Interview Preparation and Skills",
    description: "Build confidence in preparing for interviews and communicating your abilities.",
    icon: "🎤",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Interview Formats",
      "Researching an Opportunity",
      "Preparing for Common Questions",
      "Explaining Skills and Experience",
      "Professional Communication",
      "Asking Appropriate Questions",
      "Reflecting and Improving After Interviews"
    ]
  },
  {
    slug: "research-study-skills",
    category: "Professional and Career Development",
    title: "Research and Effective Study Skills",
    description: "Improve learning strategies, research habits, critical thinking, and academic organization.",
    icon: "📚",
    educationLevels: ["Secondary Education", "TVET / Technical Education", "University / Higher Education"],
    topics: [
      "Understanding Effective Learning",
      "Planning Study Time",
      "Note-Taking and Information Organization",
      "Researching Reliable Sources",
      "Critical Thinking and Evidence",
      "Referencing and Academic Integrity",
      "Reviewing Knowledge and Preparing for Assessments"
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

function renderCommunityAchievements() {
  const container = document.querySelector("#communityAchievementList");
  if (!container) return;

  if (!state.session) {
    container.textContent = "Log in to view your achievements.";
    return;
  }

  const progress = getAcademyProgress();

  let lessonsRead = 0;
  let coursesCompleted = 0;

  learnLoopCourses.forEach(course => {
    const saved = Array.isArray(progress[course.slug])
      ? progress[course.slug]
      : [];

    const validLessons = [...new Set(saved)].filter(index =>
      Number.isInteger(index) &&
      index >= 0 &&
      index < course.topics.length
    );

    lessonsRead += validLessons.length;

    if (academyCourseIsComplete(course, {
      [course.slug]: validLessons
    })) {
      coursesCompleted++;
    }
  });

  const achievements = [
    {
      icon: "🌱",
      title: "First Steps",
      description: "Read your first lesson.",
      earned: lessonsRead >= 1
    },
    {
      icon: "📚",
      title: "Dedicated Learner",
      description: "Read five lessons.",
      earned: lessonsRead >= 5
    },
    {
      icon: "🎓",
      title: "Course Graduate",
      description: "Complete one entire course.",
      earned: coursesCompleted >= 1
    },
    {
      icon: "🏆",
      title: "Knowledge Builder",
      description: "Complete three courses.",
      earned: coursesCompleted >= 3
    },
    {
      icon: "👑",
      title: "Learning Champion",
      description: "Complete every available course.",
      earned: coursesCompleted === learnLoopCourses.length
    }
  ];

  const earned = achievements.filter(item => item.earned);

  container.replaceChildren();

  if (!earned.length) {
    container.textContent =
      "Your achievements will appear here as you complete lessons.";
    return;
  }

  earned.forEach(item => {
    const card = document.createElement("article");
    card.className = "academy-course-card";

    const icon = document.createElement("div");
    icon.className = "academy-course-icon";
    icon.textContent = item.icon;

    const title = document.createElement("h3");
    title.textContent = item.title;

    const description = document.createElement("p");
    description.textContent = item.description;

    const status = document.createElement("span");
    status.className = "academy-topic-count";
    status.textContent = "✓ Achievement earned";

    card.append(icon, title, description, status);
    container.appendChild(card);
  });
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

async function submitAcademyCourseReview(event) {
  event.preventDefault();

  const client = supabase;
  const course = window.currentAcademyCourse;
  const status = document.querySelector("#academyReviewStatus");
  const button = document.querySelector("#submitAcademyReview");

  if (!client || !course || !status || !button) return;

  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    status.textContent = "Please log in to submit a review.";
    return;
  }

  const rating = Number(
    document.querySelector("#academyReviewRating").value
  );
  const review = document.querySelector("#academyReviewText").value.trim();
let certificateName = "";

if (rating === 5) {
  const profileName = state.profile?.display_name || "";

  certificateName = window.confirm(
    `Use your registered profile name "${profileName}" for your honorary certificate?`
  )
    ? profileName.trim()
    : (window.prompt(
        "Enter your full certificate name:",
        profileName
      ) || "").trim();

  if (!certificateName) {
    status.textContent =
      "Please enter your certificate name to submit your five-star award request.";
    return;
  }
}
  if (!rating || rating < 1 || rating > 5) {
    status.textContent = "Please choose a star rating.";
    return;
  }

  button.disabled = true;
  status.textContent = "Submitting your review...";

  const { error } = await client
    .from("course_reviews")
    .upsert({
      course_slug: course.slug,
      user_id: user.id,
      rating,
      review,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "course_slug,user_id"
    });

  if (error) {
    button.disabled = false;
    status.textContent = "Could not save your review. Please try again.";
    console.error("Review submission:", error);
    return;
  }

  await loadAcademyCourseReviews(course);

  if (rating === 5) {
    const { data: savedReview, error: reviewError } = await client
      .from("course_reviews")
      .select("id")
      .eq("course_slug", course.slug)
      .eq("user_id", user.id)
      .single();

    if (reviewError || !savedReview) {
      status.textContent =
        "Your review was saved, but the award request could not be prepared.";
      console.error("Review lookup:", reviewError);
      button.disabled = false;
      return;
    }

    const { data: existingRequest, error: requestLookupError } =
      await client
        .from("honorary_certificate_requests")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("course_slug", course.slug)
        .maybeSingle();

    if (requestLookupError) {
      status.textContent =
        "Your review was saved, but the award request could not be checked.";
      console.error("Award request lookup:", requestLookupError);
      button.disabled = false;
      return;
    }

    if (!existingRequest) {
      const { error: requestError } = await client
        .from("honorary_certificate_requests")
       .insert({
  user_id: user.id,
  review_id: savedReview.id,
  course_slug: course.slug,
  course_title: course.title,
  learner_name: certificateName
});
      if (requestError) {
        status.textContent =
          "Your review was saved, but the award request could not be created.";
        console.error("Award request:", requestError);
        button.disabled = false;
        return;
      }

      status.textContent =
        "Five-star review saved! Your honorary certificate request is waiting for owner approval.";
    } else if (existingRequest.status === "pending") {
      status.textContent =
        "Your honorary certificate request is already waiting for approval.";
    } else if (existingRequest.status === "approved") {
      status.textContent =
        "Your honorary certificate has already been approved.";
    } else {
      status.textContent =
        "Your previous honorary certificate request was not approved.";
    }
  } else {
    status.textContent = "Your review has been saved!";
  }

  button.disabled = false;
}

async function loadAcademyCourseReviews(course) {
const client = supabase;
  const averageBox = document.querySelector("#academyReviewAverage");
  const reviewList = document.querySelector("#academyReviewList");
  const ratingInput = document.querySelector("#academyReviewRating");
  const commentInput = document.querySelector("#academyReviewText");

  if (!client || !averageBox || !reviewList) return;

  averageBox.textContent = "Loading ratings...";
  reviewList.replaceChildren();

  const { data, error } = await client
    .from("course_reviews")
    .select("rating, review, created_at, user_id")
    .eq("course_slug", course.slug)
    .order("created_at", { ascending: false });

  if (error) {
    averageBox.textContent = "Could not load course reviews.";
    console.error("Course reviews:", error);
    return;
  }

  const reviews = data || [];

  if (reviews.length) {
    const average =
      reviews.reduce((sum, item) => sum + item.rating, 0) /
      reviews.length;

    averageBox.textContent =
      `★★★★★ ${average.toFixed(1)} / 5 (${reviews.length} reviews)`;
  } else {
    averageBox.textContent = "No ratings yet.";
  }

  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData?.session?.user?.id;

  const ownReview = reviews.find(item => item.user_id === userId);

  if (ownReview) {
    ratingInput.value = String(ownReview.rating);
    commentInput.value = ownReview.review || "";
  } else {
    ratingInput.value = "";
    commentInput.value = "";
  }

  reviews.forEach(item => {
    const card = document.createElement("article");
    card.className = "academy-review-item";

    const stars = document.createElement("strong");
    stars.textContent = "★".repeat(item.rating) +
      "☆".repeat(5 - item.rating);

    const comment = document.createElement("p");
    comment.textContent = item.review || "No written comment.";

    const date = document.createElement("small");
    date.textContent = new Date(item.created_at).toLocaleDateString();

    card.append(stars, comment, date);
    reviewList.appendChild(card);
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

const firstIncompleteIndex = course.topics.findIndex(
  (_, lessonIndex) => !readTopics.includes(lessonIndex)
);

course.topics.forEach((topic, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "academy-topic-item";
     button.disabled =
  !readTopics.includes(index) &&
  index !== firstIncompleteIndex;
   button.textContent = readTopics.includes(index)
  ? `✓ ${index + 1}. ${topic} — Review lesson`
  : index === firstIncompleteIndex
    ? `${index + 1}. ${topic} — Start lesson`
    : `🔒 ${index + 1}. ${topic}`;
  
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

const isLastLesson = index === course.topics.length - 1;

const previousLessonsCompleted = course.topics
  .slice(0, -1)
  .every((_, lessonIndex) => readTopics.includes(lessonIndex));

const actionButton = document.createElement("button");
actionButton.type = "button";
actionButton.className = "academy-open-course";

if (isLastLesson && previousLessonsCompleted) {
  actionButton.id = "academyQuizButton";
  actionButton.textContent = "Take Course Quiz";
} else if (isLastLesson) {
  actionButton.textContent = "Complete Previous Lessons First";
  actionButton.disabled = true;
} else {
  actionButton.textContent = readTopics.includes(index)
    ? "✓ Topic already marked as read"
    : "Mark as Read & Move to Next Lesson";
}

actionButton.addEventListener("click", () => {
  const latestProgress = getAcademyProgress();
  const latestRead = latestProgress[course.slug] || [];

  if (!latestRead.includes(index)) {
    latestRead.push(index);
    latestProgress[course.slug] = latestRead;
    saveAcademyProgress(latestProgress);
  }

 if (isLastLesson) {
  startAcademyQuiz(course);
  return;
}
  openAcademyCourse(course);

  const nextLessonButton = topicList.children[index + 1];

  if (nextLessonButton) {
    nextLessonButton.click();
  }

  renderAcademyCourses();
});

lessonContent.appendChild(actionButton);
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

/* ---------- LearnLoop Study Groups ---------- */

let activeStudyGroupId = null;
let activeStudyGroupIsLeader = false;

async function loadStudyGroups() {
  const container = $("#studyGroupsList");
  if (!container) return;

  if (!currentUserId()) {
    container.textContent = "Please log in to explore study groups.";
    return;
  }

  container.textContent = "Loading study groups...";

  const [groupsResult, membersResult] = await Promise.all([
    supabase
      .from("study_groups")
      .select("id, name, subject, description, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("study_group_members")
      .select("group_id, role")
      .eq("user_id", currentUserId())
  ]);

  if (groupsResult.error || membersResult.error) {
    console.error("Study groups loading error:",
      groupsResult.error || membersResult.error);
    container.textContent = "Could not load study groups. Please try again.";
    return;
  }

  const memberships = new Map(
    (membersResult.data || []).map(member => [
      member.group_id,
      member.role
    ])
  );

  if (!groupsResult.data?.length) {
    container.textContent =
      "No study groups yet. Be the first to create one!";
    return;
  }

  container.innerHTML = groupsResult.data.map(group => {
    const role = memberships.get(group.id);
    const isMember = Boolean(role);

    return `
      <article class="card info-card">
        <span class="info-icon">📚</span>
        <h3>${escapeHTML(group.name)}</h3>
        <p><strong>Subject:</strong> ${escapeHTML(group.subject)}</p>
        <p>${escapeHTML(group.description || "A LearnLoop study group.")}</p>
        <p class="muted small">
          Created ${escapeHTML(relativeTime(group.created_at))}
          ${role === "leader" ? " · Group leader" : ""}
        </p>
        <button
          type="button"
          data-study-group-action="${isMember ? "open" : "join"}"
          data-group-id="${escapeHTML(group.id)}"
        >
          ${isMember ? "Open Group" : "Join Group"}
        </button>
      </article>
    `;
  }).join("");
}

async function createStudyGroup(event) {
  event.preventDefault();

  if (!requireLogin()) return;

  const name = $("#studyGroupName")?.value.trim();
  const subject = $("#studyGroupSubject")?.value;
  const description = $("#studyGroupDescription")?.value.trim() || "";

  if (!name || !subject) {
    toast("Enter a group name and choose a subject.", "error");
    return;
  }

  const button = $("#studyGroupForm button[type='submit']");
  setButtonBusy(button, true, "Creating group...");

  try {
    const { data, error } = await supabase
      .from("study_groups")
      .insert({
        name,
        subject,
        description,
        created_by: currentUserId()
      })
      .select("id")
      .single();

    if (error) throw error;

    $("#studyGroupForm").reset();

    await loadStudyGroups();
    await openStudyGroup(data.id);

    toast("Your study group has been created.");
  } catch (error) {
    console.error("Study group creation error:", error);
    toast(`Could not create group: ${error.message}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function joinStudyGroup(groupId) {
  if (!requireLogin()) return;

  try {
    const { error } = await supabase
      .from("study_group_members")
      .insert({
        group_id: groupId,
        user_id: currentUserId(),
        role: "member"
      });

    if (error) throw error;

    await loadStudyGroups();
    await openStudyGroup(groupId);

    toast("You have joined the study group.");
  } catch (error) {
    console.error("Study group joining error:", error);

    if (error.code === "23505") {
      await loadStudyGroups();
      await openStudyGroup(groupId);
      return;
    }

    toast(`Could not join group: ${error.message}`, "error");
  }
}

async function openStudyGroup(groupId) {
  if (!requireLogin()) return;

  try {
    const [groupResult, membershipResult] = await Promise.all([
      supabase
        .from("study_groups")
        .select("id, name, subject, description, created_by")
        .eq("id", groupId)
        .single(),

      supabase
        .from("study_group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", currentUserId())
        .maybeSingle()
    ]);

    if (groupResult.error) throw groupResult.error;
    if (membershipResult.error) throw membershipResult.error;

    const group = groupResult.data;
    const membership = membershipResult.data;

    if (!membership) {
      toast("Join this group before opening its discussions.", "error");
      return;
    }

    activeStudyGroupId = group.id;
    activeStudyGroupIsLeader =
      membership.role === "leader" ||
      group.created_by === currentUserId();

    $("#studyGroupDetailsTitle").textContent =
      `${group.name} · ${group.subject}`;

    $("#studyGroupDetailsDescription").textContent =
      group.description || "Learn and share knowledge together.";

    const details = $("#studyGroupDetails");

    let backButton = $("#backToStudyGroups");

    if (!backButton) {
      backButton = document.createElement("button");
      backButton.type = "button";
      backButton.id = "backToStudyGroups";
      backButton.textContent = "← Back to Study Groups";

      backButton.addEventListener("click", () => {
        details.classList.add("hidden");
        activeStudyGroupId = null;
      });

      details.prepend(backButton);
    }

    $("#leaveStudyGroupButton").hidden = activeStudyGroupIsLeader;

    details.classList.remove("hidden");

    await loadStudyGroupMessages();

    details.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error("Study group opening error:", error);
    toast(`Could not open group: ${error.message}`, "error");
  }
}

async function loadStudyGroupMessages() {
  const container = $("#studyGroupMessages");
  if (!container || !activeStudyGroupId) return;

  container.textContent = "Loading group discussions...";

  const { data: messages, error } = await supabase
    .from("study_group_messages")
    .select("id, user_id, message, created_at")
    .eq("group_id", activeStudyGroupId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Study group messages error:", error);
    container.textContent = "Could not load group discussions.";
    return;
  }

  if (!messages?.length) {
    container.textContent =
      "No discussions yet. Start the first conversation!";
    return;
  }

  const userIds = [...new Set(messages.map(item => item.user_id))];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profilesError) {
    console.warn("Group member names could not be loaded:", profilesError);
  }

  const names = new Map(
    (profiles || []).map(profile => [
      profile.id,
      profile.display_name || "Learner"
    ])
  );

  container.innerHTML = messages.map(item => {
    const author = item.user_id === currentUserId()
      ? "You"
      : names.get(item.user_id) || "Learner";

    return `
      <article class="card">
        <strong>${escapeHTML(author)}</strong>
        <p>${escapeHTML(item.message)}</p>
        <span class="muted small">
          ${escapeHTML(relativeTime(item.created_at))}
        </span>
      </article>
    `;
  }).join("");
}

async function sendStudyGroupMessage(event) {
  event.preventDefault();

  if (!requireLogin() || !activeStudyGroupId) return;

  const input = $("#studyGroupMessage");
  const message = input?.value.trim();

  if (!message) return;

  const button = $("#studyGroupMessageForm button[type='submit']");
  setButtonBusy(button, true, "Sending...");

  try {
    const { error } = await supabase
      .from("study_group_messages")
      .insert({
        group_id: activeStudyGroupId,
        user_id: currentUserId(),
        message
      });

    if (error) throw error;

    input.value = "";
    await loadStudyGroupMessages();

    toast("Your group message has been sent.");
  } catch (error) {
    console.error("Group message error:", error);
    toast(`Could not send message: ${error.message}`, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function leaveStudyGroup() {
  if (!requireLogin() || !activeStudyGroupId) return;

  if (activeStudyGroupIsLeader) {
    toast("Group leaders cannot leave their own group.", "error");
    return;
  }

  const groupId = activeStudyGroupId;

  try {
    const { error } = await supabase
      .from("study_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", currentUserId());

    if (error) throw error;

    activeStudyGroupId = null;
    $("#studyGroupDetails").classList.add("hidden");

    await loadStudyGroups();

    toast("You have left the study group.");
  } catch (error) {
    console.error("Leaving study group error:", error);
    toast(`Could not leave group: ${error.message}`, "error");
  }
}

function bindEvents() {
  Promise.resolve()
  .then(() => loadHonoraryCertificateRequests())
  .catch(error => {
    console.error("Honorary certificate requests failed to load:", error);
  }); 
  // Academy course reviews
  const academyReviewForm =
    document.querySelector("#academyReviewForm");

  if (academyReviewForm && !academyReviewForm.dataset.connected) {
    academyReviewForm.dataset.connected = "true";

    academyReviewForm.addEventListener(
      "submit",
      submitAcademyCourseReview
    );
  }
  // LearnLoop Academy slideshow controls
  const academyHeading = document.querySelector(
    "#academyView .academy-heading"
  );

  if (academyHeading && !academyHeading.dataset.slideshowReady) {
    academyHeading.dataset.slideshowReady = "true";
    academyHeading.dataset.slide = "0";

    const controls = document.createElement("div");
    controls.className = "academy-slideshow-controls";
    controls.innerHTML = `
      <button type="button" data-academy-slide="prev"
        aria-label="Previous photo">‹</button>
      <span class="academy-slide-count">1 / 5</span>
      <button type="button" data-academy-slide="next"
        aria-label="Next photo">›</button>
    `;

    academyHeading.appendChild(controls);

    controls.addEventListener("click", event => {
      const button = event.target.closest("[data-academy-slide]");
      if (!button) return;

      let slide = Number(academyHeading.dataset.slide || 0);

      slide += button.dataset.academySlide === "next" ? 1 : -1;
      slide = (slide + 5) % 5;

      academyHeading.dataset.slide = String(slide);
      controls.querySelector(".academy-slide-count").textContent =
        `${slide + 1} / 5`;
    });
  }
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

  // Public welcome page authentication buttons
  $("#publicLoginButton")?.addEventListener("click", () => {
    setAuthMode("login");
    openDialog("authDialog");
  });

  $("#publicRegisterButton")?.addEventListener("click", () => {
    setAuthMode("signup");
    openDialog("authDialog");
  });

  $("#publicHeroRegisterButton")?.addEventListener("click", () => {
    setAuthMode("signup");
    openDialog("authDialog");
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

document.querySelector(".profile-picture-edit-button")
  ?.addEventListener("click", event => {
    event.preventDefault();
    $("#profilePicture")?.click();
  });

$("#profilePicture")?.setAttribute("accept", "image/*");

$("#profilePicture")?.setAttribute("title", "Choose a profile picture");

$("#removeProfilePictureButton")?.addEventListener("click", () => {
   
  const input = $("#profilePicture");
  const preview = $("#profilePicturePreviewImage");
  const placeholder = $("#profilePicturePlaceholder");

  if (input) input.value = "";

  if (preview) {
    preview.removeAttribute("src");
    preview.classList.add("hidden");
  }

  if (placeholder) placeholder.classList.remove("hidden");
   const removeButton = $("#removeProfilePictureButton");
if (removeButton) removeButton.dataset.removePicture = "true";
});


  $("#messageUserSearchForm")?.addEventListener(
    "submit",
    searchMessageUsers
  );
$("#messageUserSearch")?.addEventListener("input", () => {
  clearTimeout(messageUserSearchTimer);

  messageUserSearchTimer = setTimeout(() => {
    searchMessageUsers();
  }, 300);
});
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
     const removeButton = $("#removeProfilePictureButton");
if (file && removeButton) {
  removeButton.dataset.removePicture = "false";
}
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
$("#libraryEducationLevel")?.addEventListener("change", () => {
  searchBooks();
});
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
   $("#committeeApplicationForm")?.addEventListener("submit", submitCommitteeApplication);
   $("#hostDashboardButton")?.addEventListener("click", loadCommitteeMembers);
$("#hostDashboardButton")?.addEventListener("click", loadCommitteeApplications);
   $("#committeeApplicationsList")?.addEventListener("click", reviewCommitteeApplication);
$("#honoraryCertificateRequestList")?.addEventListener("click", async event => {
  const button = event.target.closest(
    "[data-honorary-action], [data-honorary-confirm], [data-honorary-cancel]"
  );

  if (!button) return;

  const card = button.closest(".notification-item");
  if (!card) return;

  const requestId = button.dataset.requestId;
  const area = card.querySelector(".honorary-decision-area");

  // Open the decision-reason box
  if (button.hasAttribute("data-honorary-action")) {
    let decisionArea = area;

    if (!decisionArea) {
      decisionArea = document.createElement("div");
      decisionArea.className = "honorary-decision-area";
      card.appendChild(decisionArea);
    }

    const reason = document.createElement("textarea");
    reason.placeholder = "Write the reason for your decision...";
    reason.maxLength = 2000;
    reason.required = true;

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent =
      button.dataset.honoraryAction === "approve"
        ? "Confirm approval"
        : "Confirm rejection";
    confirm.dataset.honoraryConfirm = button.dataset.honoraryAction;
    confirm.dataset.requestId = requestId;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.dataset.honoraryCancel = "true";

    decisionArea.replaceChildren(reason, confirm, cancel);
    reason.focus();
    return;
  }

  // Cancel the decision
  if (button.hasAttribute("data-honorary-cancel")) {
    area?.replaceChildren();
    return;
  }

  // Confirm the decision and send its reason
  if (button.hasAttribute("data-honorary-confirm")) {
    const reason = area?.querySelector("textarea")?.value.trim();

    if (!reason) {
      alert("Please write the decision reason first.");
      return;
    }

    button.disabled = true;

    if (button.dataset.honoraryConfirm === "approve") {
      await approveHonoraryCertificate(requestId, reason);
    } else {
      await rejectHonoraryCertificate(requestId, reason);
    }
  }
}); 
     // LearnLoop Study Groups events
  $("#studyGroupForm")?.addEventListener("submit", createStudyGroup);

  $("#studyGroupsList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-study-group-action]");
    if (!button) return;

    const groupId = button.dataset.groupId;

    if (button.dataset.studyGroupAction === "join") {
      joinStudyGroup(groupId);
    } else {
      openStudyGroup(groupId);
    }
  });

  $("#studyGroupMessageForm")?.addEventListener(
    "submit",
    sendStudyGroupMessage
  );

  $("#leaveStudyGroupButton")?.addEventListener(
    "click",
    leaveStudyGroup
  );
  // Close dialogs by clicking their backdrop.
  $$("dialog").forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
  
  $("#committeeMembersList")?.addEventListener("click", async event => {
  const button = event.target.closest(
    "[data-committee-message], [data-committee-edit], [data-send-committee-message], [data-save-committee-edit], [data-cancel-committee-action]"
  );

  if (!button) return;

  const card = button.closest(".card");
  const area = card?.querySelector(".committee-action-area");

  if (!card || !area || !isOwner()) return;

  // Open administrator message form
  if (button.hasAttribute("data-committee-message")) {
    const userId = button.dataset.committeeMessage;

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Write your administrator message...";
    textarea.maxLength = 5000;
    textarea.required = true;

    const send = document.createElement("button");
    send.type = "button";
    send.className = "button button-primary";
    send.textContent = "Send message";
    send.dataset.sendCommitteeMessage = userId;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button";
    cancel.textContent = "Cancel";
    cancel.dataset.cancelCommitteeAction = "true";

    area.replaceChildren(textarea, send, cancel);
    textarea.focus();
    return;
  }

  // Open position editor
  if (button.hasAttribute("data-committee-edit")) {
    const userId = button.dataset.committeeEdit;

    const roles = [
      "Accountant",
      "Secretary",
      "Community Moderator",
      "Technical Administrator",
      "Education & Community Coordinator"
    ];

    const select = document.createElement("select");
    roles.forEach(role => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      select.append(option);
    });

    const duties = document.createElement("textarea");
    duties.placeholder = "Enter new responsibilities...";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "button button-primary";
    save.textContent = "Save position";
    save.dataset.saveCommitteeEdit = userId;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button";
    cancel.textContent = "Cancel";
    cancel.dataset.cancelCommitteeAction = "true";

    area.replaceChildren(select, duties, save, cancel);
    return;
  }

  if (button.hasAttribute("data-cancel-committee-action")) {
    area.replaceChildren();
    return;
  }

  // Send administrator message
  if (button.hasAttribute("data-send-committee-message")) {
    const textarea = area.querySelector("textarea");
    const body = textarea?.value.trim();

    if (!body) {
      toast("Write a message first.", "error");
      return;
    }

    button.disabled = true;

    const { error } = await supabase.rpc("host_send_admin_message", {
      p_user_id: button.dataset.sendCommitteeMessage,
      p_body: body
    });

    button.disabled = false;

    if (error) {
      toast(error.message, "error");
      return;
    }

    area.replaceChildren();
    toast("Administrator message sent successfully.", "success");
    return;
  }

  // Save new committee position
  if (button.hasAttribute("data-save-committee-edit")) {
    const select = area.querySelector("select");
    const duties = area.querySelector("textarea");

    button.disabled = true;

    const { error } = await supabase.rpc(
      "host_update_member_position",
      {
        p_user_id: button.dataset.saveCommitteeEdit,
        p_role: select.value,
        p_responsibilities: duties.value.trim()
      }
    );

    button.disabled = false;

    if (error) {
      toast(error.message, "error");
      return;
    }

    toast("Committee position updated successfully.", "success");
    await loadCommitteeMembers();
  }
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
  ],
    "personal-hygiene": [
    {
      question: "What is the main purpose of personal hygiene?",
      options: [
        "To prevent every illness completely",
        "To maintain cleanliness and support good health",
        "To avoid all physical activity",
        "To replace medical care"
      ],
      answer: 1
    },
    {
      question: "When should you wash your hands?",
      options: [
        "Only once a week",
        "Only when they look dirty",
        "Before eating and after using the toilet",
        "Only before sleeping"
      ],
      answer: 2
    },
    {
      question: "Why is brushing teeth regularly important?",
      options: [
        "It helps prevent tooth decay and gum problems",
        "It replaces drinking water",
        "It makes dental visits unnecessary",
        "It prevents every infection"
      ],
      answer: 0
    },
    {
      question: "Which habit supports healthy skin?",
      options: [
        "Sharing personal towels",
        "Ignoring cleanliness",
        "Using unknown chemicals",
        "Keeping the body clean"
      ],
      answer: 3
    },
    {
      question: "Why should clothes be washed regularly?",
      options: [
        "To change their colour",
        "To remove dirt, sweat, and germs",
        "To make them heavier",
        "To avoid wearing clean clothes"
      ],
      answer: 1
    },
    {
      question: "Which item should generally be personal rather than shared?",
      options: [
        "A classroom desk",
        "A library book",
        "A toothbrush",
        "A school noticeboard"
      ],
      answer: 2
    },
    {
      question: "What is a good hygiene practice at school?",
      options: [
        "Keeping shared spaces clean",
        "Leaving rubbish on desks",
        "Sharing used tissues",
        "Ignoring handwashing"
      ],
      answer: 0
    },
    {
      question: "What should you do when you cough or sneeze?",
      options: [
        "Cough toward other people",
        "Use your hands and touch shared objects",
        "Ignore basic hygiene",
        "Cover your mouth and nose with a tissue or your elbow"
      ],
      answer: 3
    },
    {
      question: "Why is personal hygiene important in daily life?",
      options: [
        "It guarantees that nobody gets sick",
        "It supports cleanliness, comfort, and disease prevention",
        "It replaces healthy routines",
        "It removes the need for clean surroundings"
      ],
      answer: 1
    },
    {
      question: "How can someone build lasting hygiene habits?",
      options: [
        "Practise them consistently every day",
        "Only practise them when visitors arrive",
        "Avoid learning about hygiene",
        "Change routines randomly"
      ],
      answer: 0
    }
  ],
       "nutrition-healthy-living": [
    {
      question: "What is a balanced diet?",
      options: [
        "Eating only fruits",
        "Eating a variety of foods that provide needed nutrients",
        "Avoiding all carbohydrates",
        "Eating the same meal every day"
      ],
      answer: 1
    },
    {
      question: "Which nutrient is an important source of energy?",
      options: ["Carbohydrates", "Water", "Vitamins", "Minerals"],
      answer: 0
    },
    {
      question: "Why does the body need protein?",
      options: [
        "To replace water",
        "To prevent all diseases",
        "For growth and tissue repair",
        "To eliminate the need for sleep"
      ],
      answer: 2
    },
    {
      question: "Which is a healthy everyday drink?",
      options: ["Sugary soda", "Energy drink", "Very sweet juice", "Clean drinking water"],
      answer: 3
    },
    {
      question: "What is the role of dietary fibre?",
      options: [
        "It supports healthy digestion",
        "It replaces all vitamins",
        "It prevents the need for water",
        "It provides no nutritional benefit"
      ],
      answer: 0
    },
    {
      question: "Which food group commonly provides vitamins and minerals?",
      options: ["Sweets", "Fruits and vegetables", "Soft drinks", "Fried snacks"],
      answer: 1
    },
    {
      question: "Why is regular physical activity beneficial?",
      options: [
        "It replaces a balanced diet",
        "It guarantees perfect health",
        "It supports heart health and general wellbeing",
        "It removes the need for rest"
      ],
      answer: 2
    },
    {
      question: "Why is breakfast useful for many learners?",
      options: [
        "It replaces every other meal",
        "It guarantees high examination marks",
        "It removes the need for sleep",
        "It can provide energy and nutrients for the morning"
      ],
      answer: 3
    },
    {
      question: "What is food safety?",
      options: [
        "Handling and storing food in ways that reduce contamination",
        "Eating food without checking its condition",
        "Leaving cooked food uncovered for long periods",
        "Using unclean utensils"
      ],
      answer: 0
    },
    {
      question: "What supports healthy eating habits?",
      options: [
        "Skipping meals regularly",
        "Eating a varied diet and making informed food choices",
        "Avoiding all food groups",
        "Following every food trend"
      ],
      answer: 1
    }
  ],
      "public-health": [
    {
      question: "What is public health mainly concerned with?",
      options: [
        "Treating only individual patients",
        "Protecting and improving the health of communities",
        "Selling medical equipment",
        "Building private hospitals only"
      ],
      answer: 1
    },
    {
      question: "What is one purpose of vaccination programmes?",
      options: [
        "To replace healthy food",
        "To treat every existing illness",
        "To help prevent specific infectious diseases",
        "To eliminate the need for clean water"
      ],
      answer: 2
    },
    {
      question: "Why is access to clean water important?",
      options: [
        "It helps reduce waterborne diseases",
        "It replaces all medical services",
        "It prevents every health condition",
        "It removes the need for sanitation"
      ],
      answer: 0
    },
    {
      question: "What does disease prevention mean?",
      options: [
        "Ignoring early symptoms",
        "Avoiding health education",
        "Treating illness only after complications",
        "Taking steps to reduce the risk of illness"
      ],
      answer: 3
    },
    {
      question: "What is the purpose of health education?",
      options: [
        "To spread medical rumours",
        "To help people make informed health decisions",
        "To replace trained health workers",
        "To discourage preventive care"
      ],
      answer: 1
    },
    {
      question: "Which practice helps prevent the spread of infections?",
      options: [
        "Sharing unwashed personal items",
        "Ignoring hygiene",
        "Regular handwashing",
        "Drinking unsafe water"
      ],
      answer: 2
    },
    {
      question: "What is disease surveillance?",
      options: [
        "Monitoring diseases to identify patterns and possible outbreaks",
        "Keeping health information secret from health authorities",
        "Replacing all medical examinations",
        "Treating patients without collecting information"
      ],
      answer: 0
    },
    {
      question: "Why are sanitation systems important?",
      options: [
        "They increase environmental pollution",
        "They replace vaccination",
        "They make clean water unnecessary",
        "They help manage waste and protect community health"
      ],
      answer: 3
    },
    {
      question: "What is an outbreak?",
      options: [
        "A routine health examination",
        "An increase in disease cases above what is normally expected",
        "A community sports event",
        "A general health education lesson"
      ],
      answer: 1
    },
    {
      question: "Who contributes to improving public health?",
      options: [
        "Only doctors",
        "Only government officials",
        "Individuals, communities, health workers, and institutions",
        "Only international organisations"
      ],
      answer: 2
    }
  ],
     "workplace-safety": [
    {
      question: "What is workplace safety?",
      options: [
        "Avoiding all responsibilities",
        "Creating conditions that reduce risks and protect people",
        "Working without rules",
        "Ignoring possible hazards"
      ],
      answer: 1
    },
    {
      question: "What is a workplace hazard?",
      options: [
        "A daily work schedule",
        "A completed assignment",
        "Something that could cause harm",
        "A staff meeting"
      ],
      answer: 2
    },
    {
      question: "What should you do when you notice a workplace hazard?",
      options: [
        "Report it to the responsible person",
        "Ignore it",
        "Hide the information",
        "Encourage others to approach it"
      ],
      answer: 0
    },
    {
      question: "Why are workplace safety rules important?",
      options: [
        "To make work confusing",
        "To prevent people from learning",
        "To remove all responsibilities",
        "To help prevent accidents and injuries"
      ],
      answer: 3
    },
    {
      question: "What is the purpose of safety training?",
      options: [
        "To replace all workplace policies",
        "To help workers understand safe practices",
        "To increase workplace hazards",
        "To avoid reporting incidents"
      ],
      answer: 1
    },
    {
      question: "Why should emergency exits remain accessible?",
      options: [
        "To provide extra storage",
        "To decorate the building",
        "To support safe evacuation when necessary",
        "To restrict movement"
      ],
      answer: 2
    },
    {
      question: "What should happen after a workplace incident?",
      options: [
        "It should be reported through the appropriate procedure",
        "It should always be hidden",
        "Everyone should ignore it",
        "Unverified stories should be shared"
      ],
      answer: 0
    },
    {
      question: "What does good workplace housekeeping involve?",
      options: [
        "Leaving objects in walkways",
        "Blocking emergency routes",
        "Ignoring spills and clutter",
        "Keeping work areas clean and organized"
      ],
      answer: 3
    },
    {
      question: "Who is responsible for workplace safety?",
      options: [
        "Only visitors",
        "Employers and workers, according to their responsibilities",
        "Only new employees",
        "Nobody"
      ],
      answer: 1
    },
    {
      question: "What should workers do if they do not understand a safety procedure?",
      options: [
        "Guess what to do",
        "Ignore the procedure",
        "Ask a qualified supervisor for clarification",
        "Follow an unverified instruction"
      ],
      answer: 2
    }
  ],
       "digital-literacy": [
    {
      question: "What is digital literacy?",
      options: [
        "Using technology without understanding it",
        "Avoiding digital devices",
        "Using digital technologies effectively, safely, and responsibly",
        "Learning only how to type"
      ],
      answer: 2
    },
    {
      question: "Which is an example of a digital device?",
      options: ["A smartphone", "A wooden chair", "A paper notebook", "A pencil"],
      answer: 0
    },
    {
      question: "What makes a password stronger?",
      options: [
        "Using your first name only",
        "Using the word password",
        "Sharing it with friends",
        "Using a long, unique combination of characters"
      ],
      answer: 3
    },
    {
      question: "What should you do before sharing information online?",
      options: [
        "Share it immediately",
        "Check whether the information is reliable",
        "Trust every message",
        "Ignore the source"
      ],
      answer: 1
    },
    {
      question: "What is a web browser used for?",
      options: [
        "Repairing computer hardware",
        "Charging a phone",
        "Accessing and viewing websites",
        "Printing documents only"
      ],
      answer: 2
    },
    {
      question: "What is cloud storage?",
      options: [
        "Saving files on remote internet-based servers",
        "Keeping files only on paper",
        "Storing files in a computer keyboard",
        "Deleting files permanently"
      ],
      answer: 0
    },
    {
      question: "Which action demonstrates responsible online behaviour?",
      options: [
        "Sharing private information without permission",
        "Sending hurtful messages",
        "Copying other people's work without credit",
        "Respecting others and protecting personal information"
      ],
      answer: 3
    },
    {
      question: "What is the purpose of a search engine?",
      options: [
        "To create computer hardware",
        "To find information and resources on the internet",
        "To replace an operating system",
        "To prevent access to websites"
      ],
      answer: 1
    },
    {
      question: "Why should software be updated?",
      options: [
        "To remove every saved document",
        "To make devices less useful",
        "To improve security, fix problems, and add improvements",
        "To share passwords"
      ],
      answer: 2
    },
    {
      question: "What should you do if an online message looks suspicious?",
      options: [
        "Avoid clicking its links and verify its source",
        "Immediately provide your password",
        "Forward it to everyone",
        "Download every attachment"
      ],
      answer: 0
    }
  ],
     "coding-fundamentals": [
    {
      question: "What is programming?",
      options: [
        "Repairing electronic devices",
        "Giving a computer instructions to perform tasks",
        "Browsing websites",
        "Drawing pictures only"
      ],
      answer: 1
    },
    {
      question: "What is an algorithm?",
      options: [
        "A computer screen",
        "A programming language",
        "A step-by-step procedure for solving a problem",
        "A storage device"
      ],
      answer: 2
    },
    {
      question: "What is a variable in programming?",
      options: [
        "A named place used to store a value",
        "A computer monitor",
        "A type of printer",
        "An internet connection"
      ],
      answer: 0
    },
    {
      question: "What does a loop do in programming?",
      options: [
        "Deletes every file",
        "Turns off the computer",
        "Changes the screen size",
        "Repeats instructions"
      ],
      answer: 3
    },
    {
      question: "What is a programming bug?",
      options: [
        "A computer accessory",
        "An error or flaw in a program",
        "A type of keyboard",
        "A completed program"
      ],
      answer: 1
    },
    {
      question: "What is debugging?",
      options: [
        "Installing a new screen",
        "Deleting all program files",
        "Finding and correcting errors in code",
        "Turning off the internet"
      ],
      answer: 2
    },
    {
      question: "What is the purpose of a conditional statement?",
      options: [
        "To make decisions based on conditions",
        "To store electricity",
        "To display every file",
        "To connect a printer"
      ],
      answer: 0
    },
    {
      question: "Which of these is a programming language?",
      options: ["Microsoft Word", "Google Chrome", "Windows Explorer", "JavaScript"],
      answer: 3
    },
    {
      question: "What is the purpose of a function?",
      options: [
        "To damage a computer",
        "To organize reusable instructions for a task",
        "To replace computer memory",
        "To disconnect a network"
      ],
      answer: 1
    },
    {
      question: "Why should programmers test their code?",
      options: [
        "To make programs harder to use",
        "To avoid documenting their work",
        "To check that the program works as expected",
        "To remove useful features"
      ],
      answer: 2
    }
  ],
      "cybersecurity-awareness": [
    {
      question: "What is cybersecurity?",
      options: [
        "The study of computer games",
        "The process of protecting digital systems and information",
        "The design of computer furniture",
        "The use of social media only"
      ],
      answer: 1
    },
    {
      question: "What is phishing?",
      options: [
        "A computer programming method",
        "A normal software update",
        "A fraudulent attempt to steal sensitive information",
        "A method of organizing files"
      ],
      answer: 2
    },
    {
      question: "What should you do with your password?",
      options: [
        "Keep it private and use a unique password",
        "Post it publicly",
        "Share it with strangers",
        "Use the same simple password everywhere"
      ],
      answer: 0
    },
    {
      question: "Why is two-factor authentication useful?",
      options: [
        "It removes the need for passwords",
        "It makes every account public",
        "It prevents all possible cyberattacks",
        "It adds another layer of account protection"
      ],
      answer: 3
    },
    {
      question: "What should you do with an unexpected suspicious attachment?",
      options: [
        "Open it immediately",
        "Avoid opening it and verify the sender",
        "Forward it to everyone",
        "Upload it to public websites"
      ],
      answer: 1
    },
    {
      question: "What is malware?",
      options: [
        "A type of computer screen",
        "A trusted educational website",
        "Software designed to harm or misuse a device or system",
        "A normal document format"
      ],
      answer: 2
    },
    {
      question: "Why are software updates important for security?",
      options: [
        "They can fix security weaknesses",
        "They reveal private passwords",
        "They remove all internet access",
        "They make backups unnecessary"
      ],
      answer: 0
    },
    {
      question: "What is a secure website connection commonly indicated by?",
      options: [
        "A flashing advertisement",
        "An unknown download",
        "A spelling error in the address",
        "HTTPS in the website address"
      ],
      answer: 3
    },
    {
      question: "What should you do if you suspect your account has been compromised?",
      options: [
        "Ignore the warning",
        "Change your password and follow the service's security guidance",
        "Share your login details",
        "Disable every security feature"
      ],
      answer: 1
    },
    {
      question: "What is the safest way to use public Wi-Fi?",
      options: [
        "Access every unknown website",
        "Share sensitive information freely",
        "Avoid sensitive activities unless using a trusted secure connection",
        "Turn off all device security"
      ],
      answer: 2
    }
  ],
      "ai-data-literacy": [
    {
      question: "What is Artificial Intelligence (AI)?",
      options: [
        "A type of computer hardware",
        "Technology that enables computers to perform tasks associated with human intelligence",
        "A method of storing paper documents",
        "A computer operating system"
      ],
      answer: 1
    },
    {
      question: "What is data?",
      options: [
        "Only information written in books",
        "A computer application",
        "Recorded facts, observations, or measurements",
        "A type of internet connection"
      ],
      answer: 2
    },
    {
      question: "What is machine learning?",
      options: [
        "A method that allows computers to identify patterns from data",
        "A process of repairing computer screens",
        "A way of manually typing every answer",
        "A method of printing documents"
      ],
      answer: 0
    },
    {
      question: "Why should AI-generated information be checked?",
      options: [
        "AI always provides complete information",
        "Checking information is unnecessary",
        "AI cannot process language",
        "AI can sometimes produce inaccurate information"
      ],
      answer: 3
    },
    {
      question: "Which is an example of AI in everyday life?",
      options: [
        "A traditional wooden desk",
        "A language translation application",
        "A paper notebook",
        "A manual wall clock"
      ],
      answer: 1
    },
    {
      question: "What is data analysis?",
      options: [
        "Deleting all collected information",
        "Copying information without examining it",
        "Examining data to identify patterns and useful findings",
        "Changing numbers randomly"
      ],
      answer: 2
    },
    {
      question: "What can happen when AI systems use biased data?",
      options: [
        "Their results may be unfair or misleading",
        "They become automatically perfect",
        "They stop using electricity",
        "They always produce identical answers"
      ],
      answer: 0
    },
    {
      question: "Why is privacy important when using AI tools?",
      options: [
        "It makes information less accurate",
        "It prevents all learning",
        "It removes the need for passwords",
        "It helps protect personal and confidential information"
      ],
      answer: 3
    },
    {
      question: "What is a responsible way to use AI for learning?",
      options: [
        "Accept every answer without checking",
        "Use it as a learning aid and verify important information",
        "Submit generated work dishonestly",
        "Share other people's private information"
      ],
      answer: 1
    },
    {
      question: "Which human skill remains important when working with AI?",
      options: [
        "Avoiding all decisions",
        "Memorizing every computer output",
        "Critical thinking and responsible judgement",
        "Accepting every suggestion automatically"
      ],
      answer: 2
    }
  ],
      "entrepreneurship": [
    {
      question: "What is entrepreneurship?",
      options: [
        "Avoiding all business activities",
        "Starting and developing a venture to create value",
        "Working without a plan",
        "Copying another business without permission"
      ],
      answer: 1
    },
    {
      question: "Who is an entrepreneur?",
      options: [
        "A person who avoids solving problems",
        "A person who only buys products",
        "A person who identifies opportunities and develops ventures",
        "A person who never makes decisions"
      ],
      answer: 2
    },
    {
      question: "What is a business opportunity?",
      options: [
        "A need or problem that a product or service could address",
        "A guaranteed profit",
        "A business with no customers",
        "An activity without a purpose"
      ],
      answer: 0
    },
    {
      question: "Why is market research important?",
      options: [
        "It guarantees success",
        "It removes every business risk",
        "It replaces customer service",
        "It helps understand customers and competitors"
      ],
      answer: 3
    },
    {
      question: "What is a business plan?",
      options: [
        "A list of personal hobbies",
        "A document describing business goals and how to achieve them",
        "A record of unrelated activities",
        "A guarantee that a business will succeed"
      ],
      answer: 1
    },
    {
      question: "What is innovation in business?",
      options: [
        "Avoiding improvements",
        "Repeating mistakes",
        "Developing or improving ideas, products, or services",
        "Ignoring customer needs"
      ],
      answer: 2
    },
    {
      question: "Who are a business's customers?",
      options: [
        "People or organizations that purchase or use its products or services",
        "Only its employees",
        "Only its competitors",
        "People who never use its services"
      ],
      answer: 0
    },
    {
      question: "What does startup capital mean?",
      options: [
        "Money earned after closing a business",
        "A list of competitors",
        "The number of customers",
        "Resources or money used to establish a business"
      ],
      answer: 3
    },
    {
      question: "Why is customer feedback valuable?",
      options: [
        "It should always be ignored",
        "It can reveal areas for improvement",
        "It replaces financial records",
        "It guarantees immediate profit"
      ],
      answer: 1
    },
    {
      question: "Which quality helps entrepreneurs handle challenges?",
      options: [
        "Refusing to learn",
        "Avoiding responsibility",
        "Creativity, persistence, and willingness to learn",
        "Ignoring problems"
      ],
      answer: 2
    }
  ],
     "business-management": [
    {
      question: "What is business management?",
      options: [
        "Avoiding business responsibilities",
        "Planning, organizing, leading, and controlling business activities",
        "Selling products without planning",
        "Working without objectives"
      ],
      answer: 1
    },
    {
      question: "Why is planning important in a business?",
      options: [
        "It guarantees unlimited profit",
        "It removes every challenge",
        "It helps establish goals and decide how to achieve them",
        "It replaces teamwork"
      ],
      answer: 2
    },
    {
      question: "What is the purpose of organizing in management?",
      options: [
        "Arranging resources and responsibilities effectively",
        "Creating unnecessary tasks",
        "Avoiding communication",
        "Ignoring business objectives"
      ],
      answer: 0
    },
    {
      question: "What does leadership involve?",
      options: [
        "Making every decision without listening",
        "Avoiding responsibility",
        "Controlling information unfairly",
        "Guiding and motivating people toward shared goals"
      ],
      answer: 3
    },
    {
      question: "Why should managers monitor business performance?",
      options: [
        "To discourage employees",
        "To identify progress and areas needing improvement",
        "To avoid reviewing results",
        "To eliminate customer feedback"
      ],
      answer: 1
    },
    {
      question: "What is delegation?",
      options: [
        "Refusing to assign responsibilities",
        "Giving every task to one person",
        "Assigning appropriate tasks and authority to others",
        "Avoiding teamwork"
      ],
      answer: 2
    },
    {
      question: "Why is communication important in management?",
      options: [
        "It helps people understand goals and responsibilities",
        "It prevents employees from asking questions",
        "It replaces planning",
        "It creates unnecessary confusion"
      ],
      answer: 0
    },
    {
      question: "What is customer service?",
      options: [
        "Ignoring customer concerns",
        "Selling products without explanation",
        "Avoiding customer communication",
        "Assisting customers and responding to their needs"
      ],
      answer: 3
    },
    {
      question: "What is an operating budget?",
      options: [
        "A list of employee names",
        "A financial plan for expected income and operating expenses",
        "A record of unrelated activities",
        "A guarantee of business success"
      ],
      answer: 1
    },
    {
      question: "What is an important responsibility of an ethical manager?",
      options: [
        "Favouring selected employees unfairly",
        "Hiding important business information",
        "Making fair, responsible, and transparent decisions",
        "Ignoring workplace policies"
      ],
      answer: 2
    }
  ],
     "accounting-basics": [
    {
      question: "What is accounting?",
      options: [
        "Managing social media accounts",
        "Recording, classifying, and reporting financial transactions",
        "Selling products without records",
        "Preparing employee schedules"
      ],
      answer: 1
    },
    {
      question: "What is an asset?",
      options: [
        "Money owed to another person",
        "A business expense",
        "A resource owned or controlled by a business",
        "A financial loss"
      ],
      answer: 2
    },
    {
      question: "What is a liability?",
      options: [
        "An amount a business owes",
        "A resource owned by a business",
        "Money received from customers",
        "A business owner's personal skill"
      ],
      answer: 0
    },
    {
      question: "What is revenue?",
      options: [
        "Money spent on rent",
        "An unpaid loan",
        "The value of equipment",
        "Income earned from business activities"
      ],
      answer: 3
    },
    {
      question: "What is an expense?",
      options: [
        "A customer's payment",
        "A cost incurred while running a business",
        "A business asset",
        "An owner's investment"
      ],
      answer: 1
    },
    {
      question: "What is a balance sheet used for?",
      options: [
        "Recording staff attendance",
        "Advertising products",
        "Showing assets, liabilities, and equity at a particular date",
        "Listing customer opinions"
      ],
      answer: 2
    },
    {
      question: "What is profit?",
      options: [
        "The amount remaining when revenue exceeds expenses",
        "All money borrowed",
        "The total value of unpaid bills",
        "The amount spent on equipment"
      ],
      answer: 0
    },
    {
      question: "Why should a business keep financial records?",
      options: [
        "To make spending harder to understand",
        "To avoid planning",
        "To replace customer records",
        "To track transactions and support decisions"
      ],
      answer: 3
    },
    {
      question: "What is a budget?",
      options: [
        "A list of business competitors",
        "A plan for expected income and expenses",
        "A record of employee qualifications",
        "A guarantee of profit"
      ],
      answer: 1
    },
    {
      question: "What is the accounting equation?",
      options: [
        "Revenue = Expenses + Sales",
        "Profit = Assets + Liabilities",
        "Assets = Liabilities + Equity",
        "Expenses = Assets + Revenue"
      ],
      answer: 2
    }
  ],
     "project-management": [
    {
      question: "What is project management?",
      options: [
        "Working without objectives",
        "Planning, organizing, and managing resources to achieve project goals",
        "Avoiding teamwork",
        "Completing tasks without deadlines"
      ],
      answer: 1
    },
    {
      question: "What is a project objective?",
      options: [
        "An unrelated activity",
        "A list of employees",
        "A clearly defined result a project aims to achieve",
        "An unexpected expense"
      ],
      answer: 2
    },
    {
      question: "Why is project planning important?",
      options: [
        "It helps organize tasks, resources, and timelines",
        "It guarantees there will be no challenges",
        "It removes the need for communication",
        "It prevents progress reviews"
      ],
      answer: 0
    },
    {
      question: "What is a project deadline?",
      options: [
        "The project budget",
        "The project manager's job title",
        "A list of project materials",
        "The date by which a task or project should be completed"
      ],
      answer: 3
    },
    {
      question: "What is a project milestone?",
      options: [
        "An unrelated meeting",
        "An important point or achievement in a project's progress",
        "A personal opinion",
        "An unexpected delay"
      ],
      answer: 1
    },
    {
      question: "What is project risk management?",
      options: [
        "Ignoring possible problems",
        "Removing every project activity",
        "Identifying and responding to possible risks",
        "Avoiding project communication"
      ],
      answer: 2
    },
    {
      question: "Why should project responsibilities be assigned clearly?",
      options: [
        "So team members understand their tasks",
        "So nobody knows what to do",
        "To prevent accountability",
        "To duplicate every task"
      ],
      answer: 0
    },
    {
      question: "What is a project budget?",
      options: [
        "A list of project members",
        "A record of meeting attendance",
        "A description of the project title",
        "An estimate of the money needed for project activities"
      ],
      answer: 3
    },
    {
      question: "Why should project progress be monitored?",
      options: [
        "To avoid making decisions",
        "To identify delays and check progress against objectives",
        "To remove all deadlines",
        "To prevent team feedback"
      ],
      answer: 1
    },
    {
      question: "What usually happens during project closure?",
      options: [
        "All records are discarded",
        "The team ignores the results",
        "Deliverables are reviewed and lessons are documented",
        "The project objectives are forgotten"
      ],
      answer: 2
    }
  ],
      "teamwork-collaboration": [
    { question: "What is teamwork?", options: ["Working alone always", "People cooperating toward a shared goal", "Competing against every colleague", "Avoiding responsibilities"], answer: 1 },
    { question: "What makes a team effective?", options: ["Poor communication", "Unclear responsibilities", "Trust and cooperation", "Ignoring different ideas"], answer: 2 },
    { question: "Why should team members listen to one another?", options: ["To understand ideas and concerns", "To delay every decision", "To avoid participation", "To prevent feedback"], answer: 0 },
    { question: "What is collaboration?", options: ["Working without a goal", "Giving all work to one person", "Avoiding discussion", "Working together and contributing skills"], answer: 3 },
    { question: "How should tasks be distributed?", options: ["Randomly without explanation", "Fairly according to skills and responsibilities", "Only to the team leader", "Without considering workload"], answer: 1 },
    { question: "What is a constructive response to disagreement?", options: ["Insulting others", "Refusing to listen", "Discussing differences respectfully", "Ending cooperation"], answer: 2 },
    { question: "Why are shared goals important?", options: ["They give team members a common direction", "They remove individual responsibilities", "They prevent planning", "They create unnecessary competition"], answer: 0 },
    { question: "What should a team member do after making a mistake?", options: ["Hide it", "Blame another person", "Ignore its effects", "Accept responsibility and help correct it"], answer: 3 },
    { question: "How can a team build trust?", options: ["By hiding information", "By being reliable, honest, and respectful", "By breaking promises", "By avoiding communication"], answer: 1 },
    { question: "What is one benefit of evaluating team performance?", options: ["It discourages improvement", "It creates blame", "It identifies strengths and areas to improve", "It removes shared goals"], answer: 2 }
  ],

  "conflict-resolution": [
    { question: "What is conflict?", options: ["A disagreement or clash of interests", "Always a physical fight", "A shared achievement", "A type of agreement"], answer: 0 },
    { question: "What is the first useful step in resolving a disagreement?", options: ["Blaming someone", "Listening to understand the issue", "Spreading rumours", "Ignoring everyone"], answer: 1 },
    { question: "What is active listening?", options: ["Interrupting frequently", "Preparing an argument", "Paying attention and clarifying what someone means", "Changing the subject"], answer: 2 },
    { question: "What does compromise mean?", options: ["One person always wins", "Avoiding every discussion", "Refusing to change", "Finding an acceptable middle ground"], answer: 3 },
    { question: "Why is remaining calm helpful during conflict?", options: ["It guarantees agreement", "It supports clearer and more respectful discussion", "It removes the need to listen", "It makes the other person wrong"], answer: 1 },
    { question: "What is mediation?", options: ["Punishing everyone involved", "Ignoring the disagreement", "A neutral person helping people discuss a solution", "Making decisions without hearing anyone"], answer: 2 },
    { question: "Which is an example of respectful communication?", options: ["Explaining concerns without insults", "Threatening the other person", "Sharing private information", "Shouting over others"], answer: 0 },
    { question: "What should happen if a conflict involves a safety concern?", options: ["Keep it secret", "Encourage confrontation", "Ignore the concern", "Seek help from a trusted responsible person"], answer: 3 },
    { question: "Why should people focus on the problem rather than personal attacks?", options: ["To avoid finding solutions", "To keep discussion constructive", "To make disagreements longer", "To prevent cooperation"], answer: 1 },
    { question: "What is a useful final step after resolving a conflict?", options: ["Restart the argument", "Spread blame", "Agree on actions and responsibilities", "Avoid all future communication"], answer: 2 }
  ],

  "community-development": [
    { question: "What is community development?", options: ["A process of improving community wellbeing and opportunities", "A plan for one person only", "A way to prevent cooperation", "A competition between neighbours"], answer: 0 },
    { question: "Why should community members participate in development?", options: ["To avoid responsibility", "To help identify needs and contribute ideas", "To prevent local decisions", "To replace all public services"], answer: 1 },
    { question: "What is a community needs assessment?", options: ["A list of unrelated activities", "A financial reward", "A process for identifying local needs and priorities", "A personal opinion only"], answer: 2 },
    { question: "What is a community project?", options: ["An activity without a purpose", "A private task unrelated to residents", "A competition with no benefit", "An organized activity addressing a shared local need"], answer: 3 },
    { question: "Why is inclusion important in community projects?", options: ["It limits participation", "It helps different groups have a voice", "It gives decisions to one person", "It prevents cooperation"], answer: 1 },
    { question: "What is a community resource?", options: ["Only money", "Only buildings", "People, skills, facilities, and other useful local assets", "An unrelated personal possession"], answer: 2 },
    { question: "Why should community projects have clear objectives?", options: ["To guide activities and measure progress", "To make planning impossible", "To avoid accountability", "To prevent evaluation"], answer: 0 },
    { question: "What is volunteerism?", options: ["Working only for a salary", "Avoiding community needs", "Competing for personal rewards", "Contributing time or skills voluntarily"], answer: 3 },
    { question: "Why is transparency important in community projects?", options: ["It hides decisions", "It helps build trust and accountability", "It prevents questions", "It removes the need for records"], answer: 1 },
    { question: "How can a community assess project success?", options: ["By counting meetings only", "By ignoring residents", "By reviewing results against the original objectives", "By avoiding feedback"], answer: 2 }
  ],

  "civic-education": [
    { question: "What is civic education?", options: ["Learning about citizenship, rights, responsibilities, and public life", "Learning only about business", "Studying sports rules", "Avoiding community participation"], answer: 0 },
    { question: "What is a citizen's responsibility?", options: ["Ignoring other people's rights", "Respecting laws and the rights of others", "Spreading false information", "Avoiding all community matters"], answer: 1 },
    { question: "Why are laws important in society?", options: ["They remove every disagreement", "They benefit only a few people", "They establish rules and help protect rights and order", "They replace personal responsibility"], answer: 2 },
    { question: "What does equality before the law mean?", options: ["Some people have no responsibilities", "Rules apply only to visitors", "Everyone must have identical opinions", "People should receive equal legal treatment"], answer: 3 },
    { question: "What is public participation?", options: ["Avoiding public discussions", "Taking part in decisions and activities affecting society", "Ignoring local issues", "Preventing others from speaking"], answer: 1 },
    { question: "What is a human right?", options: ["A reward for wealthy people", "A privilege available only at school", "A basic entitlement belonging to every person", "A personal business agreement"], answer: 2 },
    { question: "Why is respect for diversity important?", options: ["It supports peaceful coexistence", "It requires everyone to think alike", "It prevents cooperation", "It encourages discrimination"], answer: 0 },
    { question: "What is the purpose of public institutions?", options: ["To serve only private interests", "To prevent citizens from receiving services", "To avoid public accountability", "To provide services and carry out public responsibilities"], answer: 3 },
    { question: "What is responsible citizenship online?", options: ["Sharing rumours", "Checking information and communicating respectfully", "Publishing private details", "Harassing people with different views"], answer: 1 },
    { question: "How can citizens contribute to peaceful communities?", options: ["By encouraging discrimination", "By ignoring community concerns", "By respecting others and resolving disagreements peacefully", "By spreading unverified accusations"], answer: 2 }
  ],

  "french-communication": [
    { question: "What does 'Bonjour' mean in English?", options: ["Good morning / Hello", "Good night", "Goodbye", "Thank you"], answer: 0 },
    { question: "How do you say 'Thank you' in French?", options: ["Pardon", "Merci", "Bonsoir", "Au revoir"], answer: 1 },
    { question: "Which phrase means 'My name is...'?", options: ["Comment allez-vous?", "Où habitez-vous?", "Je m'appelle...", "À bientôt"], answer: 2 },
    { question: "What does 'Comment allez-vous?' mean?", options: ["Where are you going?", "What is your name?", "How old are you?", "How are you?"], answer: 3 },
    { question: "Which is the correct French word for 'book'?", options: ["Une table", "Un livre", "Une maison", "Un stylo"], answer: 1 },
    { question: "How do you say 'Please' in French?", options: ["Jamais", "Demain", "S'il vous plaît", "Hier"], answer: 2 },
    { question: "Which phrase is a polite greeting in the evening?", options: ["Bonsoir", "Merci", "Pardon", "Non"], answer: 0 },
    { question: "What does 'Je ne comprends pas' mean?", options: ["I am happy", "I am ready", "I agree", "I do not understand"], answer: 3 },
    { question: "Which word means 'today' in French?", options: ["Demain", "Aujourd'hui", "Hier", "Toujours"], answer: 1 },
    { question: "Which sentence means 'I speak French'?", options: ["Je mange du pain.", "Je vais à l'école.", "Je parle français.", "Je lis un livre."], answer: 2 }
  ],

  "kinyarwanda-communication": [
    { question: "What does 'Muraho' commonly mean?", options: ["Hello", "Goodbye", "Sorry", "Please"], answer: 0 },
    { question: "What does 'Murakoze' mean?", options: ["Welcome", "Thank you", "Good night", "Good morning"], answer: 1 },
    { question: "Which expression is commonly used to say goodbye?", options: ["Yego", "Oya", "Murabeho", "Murakoze"], answer: 2 },
    { question: "What does 'Yego' mean?", options: ["No", "Maybe", "Please", "Yes"], answer: 3 },
    { question: "What does 'Oya' mean?", options: ["Thank you", "No", "Hello", "Welcome"], answer: 1 },
    { question: "Which expression means 'Good morning'?", options: ["Ijoro ryiza", "Murabeho", "Mwaramutse", "Murakoze"], answer: 2 },
    { question: "Why is respectful language important?", options: ["It supports polite and positive communication", "It prevents people from asking questions", "It encourages insults", "It makes messages unclear"], answer: 0 },
    { question: "What is a useful way to improve Kinyarwanda communication?", options: ["Avoid listening", "Memorize words without using them", "Never ask for clarification", "Practise speaking, reading, and listening"], answer: 3 },
    { question: "What should you do if you do not understand a word?", options: ["Pretend you understand", "Politely ask for its meaning", "Change the subject immediately", "Criticize the speaker"], answer: 1 },
    { question: "Which skill helps people understand spoken Kinyarwanda?", options: ["Ignoring pronunciation", "Avoiding conversations", "Listening carefully to words and context", "Speaking without listening"], answer: 2 }
  ],

  "professional-writing": [
    { question: "What is professional writing?", options: ["Clear and appropriate writing for work or formal purposes", "Writing without considering readers", "Using slang in every document", "Copying another person's work"], answer: 0 },
    { question: "What should a professional email subject line do?", options: ["Contain unrelated details", "Clearly describe the email's purpose", "Be left confusing", "Include the entire message"], answer: 1 },
    { question: "Which greeting is suitable for a formal email?", options: ["Hey you!", "What's up?", "Dear Ms. / Mr. [Name],", "Listen here,"], answer: 2 },
    { question: "Why should professional writing be proofread?", options: ["To make it longer", "To add unrelated information", "To remove every paragraph", "To correct errors and improve clarity"], answer: 3 },
    { question: "What is the purpose of a report introduction?", options: ["To list unrelated references", "To introduce the topic and purpose", "To present only the conclusion", "To repeat the title many times"], answer: 1 },
    { question: "What makes instructions effective?", options: ["Unclear language", "Missing steps", "Logical order and clear wording", "Unexplained abbreviations"], answer: 2 },
    { question: "Why should writers consider their audience?", options: ["To choose suitable language and detail", "To make every text informal", "To avoid explaining ideas", "To use the same style in every situation"], answer: 0 },
    { question: "What is plagiarism?", options: ["Checking spelling", "Writing an original summary", "Citing a source correctly", "Presenting someone else's work or ideas as your own"], answer: 3 },
    { question: "Which feature improves readability?", options: ["Very long unstructured paragraphs", "Clear headings and organized paragraphs", "Unexplained technical terms", "Random punctuation"], answer: 1 },
    { question: "What is a suitable professional email closing?", options: ["Whatever.", "Bye forever!", "Kind regards,", "Answer me now."], answer: 2 }
  ],

  "modern-agriculture": [
    { question: "What is modern agriculture?", options: ["Using improved knowledge and methods to produce crops and livestock", "Farming without planning", "Avoiding all new information", "Growing crops without considering soil"], answer: 0 },
    { question: "Why is good-quality seed important?", options: ["It guarantees every harvest", "It can support healthy crop establishment and production", "It removes the need for water", "It prevents all pests"], answer: 1 },
    { question: "What is crop rotation?", options: ["Growing one crop forever", "Harvesting without planning", "Growing different crops in sequence on the same land", "Moving crops after every rainfall"], answer: 2 },
    { question: "Why is soil testing useful?", options: ["It measures the weather", "It identifies market prices", "It replaces irrigation", "It helps understand soil conditions and nutrient needs"], answer: 3 },
    { question: "What is irrigation?", options: ["Removing all plants", "Supplying water to crops when needed", "Harvesting crops", "Storing farm tools"], answer: 1 },
    { question: "What is integrated pest management?", options: ["Using only one method in every situation", "Ignoring pest problems", "Combining suitable methods to manage pests responsibly", "Applying chemicals without guidance"], answer: 2 },
    { question: "Why is farm recordkeeping useful?", options: ["It helps track costs, activities, and production", "It makes planning impossible", "It replaces all field observations", "It prevents learning"], answer: 0 },
    { question: "What is post-harvest handling?", options: ["Planting seeds", "Preparing the land", "Selecting a market before planting", "Activities that protect produce after harvesting"], answer: 3 },
    { question: "Why should farmers consider weather information?", options: ["It guarantees rainfall", "It helps plan suitable farming activities", "It replaces soil management", "It prevents every crop disease"], answer: 1 },
    { question: "What is agricultural extension?", options: ["Selling farm equipment only", "Transporting produce only", "Sharing practical agricultural knowledge and advice with farmers", "Replacing farmers' decisions"], answer: 2 }
  ],

  "sustainable-farming": [
    { question: "What is sustainable farming?", options: ["Producing food while protecting resources for the future", "Using resources without limits", "Ignoring soil health", "Focusing only on immediate production"], answer: 0 },
    { question: "Why is crop diversity beneficial?", options: ["It guarantees no pests", "It can support resilience and biodiversity", "It removes the need for planning", "It makes every crop identical"], answer: 1 },
    { question: "What is compost?", options: ["A synthetic fuel", "A type of irrigation pipe", "Organic material decomposed for use as a soil amendment", "A harvested grain"], answer: 2 },
    { question: "Why should farmers reduce unnecessary chemical use?", options: ["To make crops less productive", "To avoid learning about pests", "To remove all farm management", "To reduce potential harm to people and the environment"], answer: 3 },
    { question: "What is agroforestry?", options: ["Removing all trees from farmland", "Combining trees with crops or livestock systems", "Growing trees only in cities", "Replacing every crop with grass"], answer: 1 },
    { question: "How can farmers protect soil fertility?", options: ["Leaving soil exposed continuously", "Burning all organic matter", "Using suitable rotations and organic amendments", "Removing all plant cover"], answer: 2 },
    { question: "What is one benefit of mulching?", options: ["It can help conserve soil moisture", "It removes every weed permanently", "It replaces all nutrients", "It guarantees no crop disease"], answer: 0 },
    { question: "Why is biodiversity important in farming?", options: ["It makes ecosystems less stable", "It prevents all weather changes", "It removes the need for soil", "It supports healthy and resilient ecosystems"], answer: 3 },
    { question: "What does responsible water management involve?", options: ["Using unlimited water", "Using water efficiently and protecting water sources", "Ignoring leaks", "Polluting streams"], answer: 1 },
    { question: "How can farmers assess whether a practice is sustainable?", options: ["By considering only one day's harvest", "By ignoring costs", "By reviewing environmental, economic, and social effects", "By avoiding records"], answer: 2 }
  ],

  "soil-water-conservation": [
    { question: "What is soil conservation?", options: ["Protecting soil from degradation and erosion", "Removing all vegetation", "Increasing uncontrolled runoff", "Leaving land unmanaged"], answer: 0 },
    { question: "What is soil erosion?", options: ["The natural formation of seeds", "The removal of topsoil by water or wind", "The storage of rainwater", "The growth of plant roots"], answer: 1 },
    { question: "How can vegetation help protect soil?", options: ["It increases bare ground", "It removes all soil nutrients", "Roots help hold soil in place", "It prevents every rainfall"], answer: 2 },
    { question: "What is rainwater harvesting?", options: ["Allowing water to run away", "Removing water from wells", "Polluting water sources", "Collecting and storing rainwater for later use"], answer: 3 },
    { question: "What is contour farming?", options: ["Ploughing straight downhill", "Cultivating along the natural contour lines of a slope", "Removing all terraces", "Planting without considering the land"], answer: 1 },
    { question: "Why are terraces used on some slopes?", options: ["To increase rapid runoff", "To remove vegetation", "To slow water flow and reduce erosion", "To prevent all crop growth"], answer: 2 },
    { question: "What is groundwater?", options: ["Water stored beneath the Earth's surface", "Water found only in clouds", "Water in a cooking pot", "Water flowing above all land"], answer: 0 },
    { question: "Which practice can reduce water waste in agriculture?", options: ["Leaving pipes leaking", "Irrigating without considering crop needs", "Flooding every field continuously", "Using suitable, well-managed irrigation methods"], answer: 3 },
    { question: "Why should water sources be protected from pollution?", options: ["To make water harder to access", "To protect human health and ecosystems", "To increase waste", "To discourage sanitation"], answer: 1 },
    { question: "What is watershed management?", options: ["Managing one household tap only", "Removing all trees", "Coordinating land and water protection within a drainage area", "Ignoring rivers and streams"], answer: 2 }
  ],

  "climate-environment": [
    { question: "What is climate?", options: ["The long-term pattern of weather in an area", "The temperature at one moment", "A single rainstorm", "A daily weather forecast"], answer: 0 },
    { question: "What is climate change?", options: ["A change in today's weather only", "Long-term changes in climate patterns", "The movement of clouds during one day", "A seasonal school timetable"], answer: 1 },
    { question: "Which gas is a major greenhouse gas?", options: ["Helium", "Neon", "Carbon dioxide", "Argon"], answer: 2 },
    { question: "What is deforestation?", options: ["Planting trees", "Protecting forests", "Restoring damaged land", "Removing forests or large areas of trees"], answer: 3 },
    { question: "What is biodiversity?", options: ["The number of buildings in a city", "The variety of living organisms in an area", "The amount of rainfall only", "The number of roads"], answer: 1 },
    { question: "Which action can help reduce waste?", options: ["Throwing away reusable items", "Buying unnecessary products", "Reusing and recycling suitable materials", "Burning all household waste"], answer: 2 },
    { question: "What is renewable energy?", options: ["Energy from sources naturally replenished, such as sunlight and wind", "Energy only from coal", "Energy from disposable batteries only", "Energy that cannot be replaced"], answer: 0 },
    { question: "Why are wetlands important?", options: ["They have no ecological value", "They increase all pollution", "They prevent all rainfall", "They support wildlife and help regulate water"], answer: 3 },
    { question: "What is adaptation to climate change?", options: ["Ignoring environmental changes", "Adjusting to actual or expected climate impacts", "Increasing avoidable risks", "Stopping all environmental planning"], answer: 1 },
    { question: "How can individuals support environmental protection?", options: ["Wasting water", "Littering public spaces", "Conserving resources and making responsible choices", "Destroying natural habitats"], answer: 2 }
  ],

  "food-systems-agribusiness": [
    { question: "What is a food system?", options: ["The connected activities involved in producing, processing, distributing, and consuming food", "A list of restaurants only", "A farming tool", "A method of cooking one meal"], answer: 0 },
    { question: "What is agribusiness?", options: ["A business unrelated to agriculture", "Business activities connected to agricultural products and services", "A type of school subject only", "A method of storing water"], answer: 1 },
    { question: "What is food security?", options: ["Having only one food choice", "Producing food without distribution", "Reliable access to sufficient, safe, nutritious food", "Storing food without checking its condition"], answer: 2 },
    { question: "What is value addition in agriculture?", options: ["Reducing product quality", "Discarding useful produce", "Avoiding processing", "Increasing a product's value through processing or improvement"], answer: 3 },
    { question: "Why is food storage important?", options: ["It makes food spoil faster", "It helps maintain quality and reduce losses", "It replaces food safety", "It removes the need for transport"], answer: 1 },
    { question: "What is a supply chain?", options: ["A list of farm tools", "A method of planting seeds", "The connected steps that move products from producers to consumers", "A household shopping list"], answer: 2 },
    { question: "Why should agribusiness owners understand their market?", options: ["To understand customers, demand, and competition", "To avoid customer needs", "To guarantee profit", "To stop comparing costs"], answer: 0 },
    { question: "What is food traceability?", options: ["Changing food labels", "Removing production records", "Selling without information", "Being able to follow food through stages of production and distribution"], answer: 3 },
    { question: "What can reduce post-harvest losses?", options: ["Poor storage", "Suitable handling, storage, and transport", "Leaving produce exposed", "Delaying all sorting"], answer: 1 },
    { question: "Why are accurate financial records useful in agribusiness?", options: ["They replace market research", "They guarantee high prices", "They help monitor costs, income, and business performance", "They make planning unnecessary"], answer: 2 }
  ],

  "workplace-ethics": [
    { question: "What are workplace ethics?", options: ["Principles that guide responsible and fair conduct at work", "Rules for avoiding all tasks", "A method of competing unfairly", "A list of personal preferences"], answer: 0 },
    { question: "What does honesty at work involve?", options: ["Hiding important mistakes", "Being truthful and accurate", "Changing records without permission", "Blaming others for every problem"], answer: 1 },
    { question: "What is confidentiality?", options: ["Sharing every private document", "Discussing private matters publicly", "Protecting information that should not be disclosed", "Publishing passwords"], answer: 2 },
    { question: "What is a conflict of interest?", options: ["A normal team meeting", "A completed work task", "A workplace training session", "A situation where personal interests may improperly affect professional decisions"], answer: 3 },
    { question: "How should employees treat colleagues?", options: ["With favouritism", "With fairness and respect", "With deliberate disrespect", "By excluding people unfairly"], answer: 1 },
    { question: "What should someone do if asked to falsify a work record?", options: ["Agree immediately", "Hide the request", "Refuse and use the appropriate reporting process", "Change the record secretly"], answer: 2 },
    { question: "Why is accountability important?", options: ["It encourages people to take responsibility for their actions", "It removes responsibility", "It prevents learning", "It makes mistakes impossible"], answer: 0 },
    { question: "What is professional integrity?", options: ["Doing only what benefits you", "Avoiding difficult decisions", "Ignoring workplace standards", "Acting consistently with ethical principles"], answer: 3 },
    { question: "How should confidential information be handled?", options: ["Shared with everyone", "Accessed and shared only when authorized", "Posted on social media", "Stored without protection"], answer: 1 },
    { question: "What should you do when you witness unethical conduct?", options: ["Spread rumours", "Encourage it", "Follow appropriate workplace reporting procedures", "Alter records to hide it"], answer: 2 }
  ],

  "cv-job-applications": [
    { question: "What is the main purpose of a CV?", options: ["To summarize relevant education, skills, and experience", "To list unrelated personal details", "To guarantee employment", "To replace an interview"], answer: 0 },
    { question: "Why should a CV be tailored to a role?", options: ["To make it longer", "To highlight relevant skills and experience", "To hide qualifications", "To include unrelated information"], answer: 1 },
    { question: "Which information belongs in an education section?", options: ["A friend's password", "Unrelated family stories", "Relevant qualifications and institutions", "Unverified claims"], answer: 2 },
    { question: "What is a cover letter?", options: ["A list of references only", "A copy of every certificate", "A personal diary", "A letter explaining interest and suitability for a role"], answer: 3 },
    { question: "Why should information in a job application be accurate?", options: ["To make the application confusing", "To demonstrate honesty and reliability", "To impress through invented claims", "To avoid verification"], answer: 1 },
    { question: "What is a transferable skill?", options: ["A skill useful in different roles or settings", "A qualification that cannot be used", "A private password", "A job title"], answer: 2 },
    { question: "What should you do before submitting an application?", options: ["Check instructions, spelling, and required documents", "Send an incomplete application", "Ignore the deadline", "Use another person's identity"], answer: 0 },
    { question: "What is a professional reference?", options: ["An anonymous rumour", "A random online comment", "An unrelated advertisement", "A person who can appropriately comment on your abilities or work"], answer: 3 },
    { question: "How should employment gaps be handled in an application?", options: ["Invent a job", "Explain them honestly when relevant", "Change dates falsely", "Hide required information"], answer: 1 },
    { question: "Why should a CV be easy to read?", options: ["To include as many fonts as possible", "To hide important information", "To help employers find relevant information quickly", "To make the document confusing"], answer: 2 }
  ],

  "interview-skills": [
    { question: "Why should you research an organization before an interview?", options: ["To understand its work and the role", "To memorize unrelated facts", "To avoid preparing", "To guarantee selection"], answer: 0 },
    { question: "What is appropriate interview behaviour?", options: ["Interrupting every question", "Listening carefully and responding respectfully", "Using insulting language", "Ignoring the interviewer"], answer: 1 },
    { question: "How should you answer a question about your experience?", options: ["Invent achievements", "Avoid giving examples", "Give an honest and relevant example", "Discuss unrelated private matters"], answer: 2 },
    { question: "Why is arriving on time important?", options: ["It replaces preparation", "It guarantees employment", "It makes questions unnecessary", "It demonstrates respect and reliability"], answer: 3 },
    { question: "What should you do if you do not understand an interview question?", options: ["Guess without listening", "Politely ask for clarification", "Ignore the question", "Criticize the interviewer"], answer: 1 },
    { question: "What is a useful way to prepare for common interview questions?", options: ["Memorize false answers", "Avoid learning about the role", "Practise clear answers using genuine examples", "Prepare no examples"], answer: 2 },
    { question: "How should you discuss a weakness?", options: ["Be honest and explain steps you are taking to improve", "Claim you have no weaknesses", "Blame other people", "Avoid answering respectfully"], answer: 0 },
    { question: "What is a suitable question to ask at the end of an interview?", options: ["Can I ignore the job duties?", "Why is everyone here?", "Can you guarantee my promotion?", "What are the main responsibilities of this role?"], answer: 3 },
    { question: "What should you do after an interview?", options: ["Share confidential interview details", "Send a brief, polite thank-you message when appropriate", "Contact the interviewer repeatedly", "Post private information online"], answer: 1 },
    { question: "What is the best way to present your qualifications?", options: ["Exaggerate your experience", "Claim skills you do not have", "Describe your genuine skills and relevant examples", "Avoid explaining your contribution"], answer: 2 }
  ],

  "research-study-skills": [
    { question: "What is research?", options: ["A systematic process of investigating a question", "Copying information without checking it", "Guessing without evidence", "Collecting unrelated opinions only"], answer: 0 },
    { question: "What is a research question?", options: ["A final grade", "A focused question that guides an investigation", "A list of unrelated facts", "A personal advertisement"], answer: 1 },
    { question: "Why should researchers use reliable sources?", options: ["To make research longer", "To avoid checking evidence", "To support accurate and trustworthy conclusions", "To copy information without attribution"], answer: 2 },
    { question: "What is plagiarism?", options: ["Writing a research question", "Summarizing with proper citation", "Comparing different sources", "Using someone else's work without proper acknowledgment"], answer: 3 },
    { question: "What is a hypothesis?", options: ["A guaranteed result", "A testable proposed explanation or prediction", "A list of references", "A final report title"], answer: 1 },
    { question: "What is the purpose of taking study notes?", options: ["To copy every page without thinking", "To avoid reviewing information", "To record and organize important ideas", "To replace understanding"], answer: 2 },
    { question: "Which study method can support long-term learning?", options: ["Spaced practice and regular review", "Studying only once at the last minute", "Avoiding practice questions", "Reading without checking understanding"], answer: 0 },
    { question: "What is a primary source?", options: ["A textbook summary only", "An unrelated opinion", "A general dictionary definition", "Original evidence or information from a direct source"], answer: 3 },
    { question: "Why is time management important when studying?", options: ["It removes the need for rest", "It helps organize tasks and make steady progress", "It guarantees perfect results", "It prevents flexibility"], answer: 1 },
    { question: "What should you do when research sources disagree?", options: ["Choose the first result automatically", "Ignore all evidence", "Compare source quality, methods, and supporting evidence", "Assume every source is equally reliable"], answer: 2 }
  ]
};

const ACADEMY_QUIZ_SECONDS = 50;
const ACADEMY_PASSING_SCORE = 12;

let academyQuizTimer = null;
window.currentAcademyCourse = window.currentAcademyCourse || null;

async function startAcademyQuiz(course) {
   const questions = academyCourseQuizzes[course.slug];
const quizDialog = document.querySelector("#academyQuizDialog");
const quizPanel = document.querySelector("#academyQuizPanel");
const certificatePanel = document.querySelector("#academyCertificatePanel");

if (quizDialog && !quizDialog.open) {
  quizDialog.showModal();
}
 
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

 if (!jsPDF || typeof QRCode === "undefined") {
  alert("PDF or QR library could not load. Please refresh and try again.");
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

      
// LEARNLOOP PREMIUM GLOBAL CERTIFICATE — LANDSCAPE A4

// Brand colours
const navy = [20, 39, 77];
const gold = [198, 158, 64];
const cream = [250, 248, 241];
const paleGold = [255, 248, 225];

// Background and decorative frame
pdf.setFillColor(...navy);
pdf.rect(0, 0, 297, 210, "F");

pdf.setFillColor(...cream);
pdf.rect(5, 5, 287, 200, "F");

pdf.setDrawColor(...gold);
pdf.setLineWidth(1.2);
pdf.rect(9, 9, 279, 192);

pdf.setDrawColor(...navy);
pdf.setLineWidth(0.5);
pdf.rect(12, 12, 273, 186);

// Decorative corner ribbons
pdf.setDrawColor(...navy);
pdf.setLineWidth(7);
pdf.line(9, 42, 42, 9);
pdf.line(255, 201, 288, 168);

pdf.setDrawColor(...gold);
pdf.setLineWidth(2);
pdf.line(9, 30, 30, 9);
pdf.line(267, 201, 288, 180);

// Subtle decorative side ornaments
pdf.setDrawColor(226, 218, 195);
pdf.setLineWidth(0.7);

for (let i = 0; i < 6; i++) {
  pdf.ellipse(29 + i * 2, 111 + i * 4, 2, 4, "S");
  pdf.ellipse(268 - i * 2, 111 + i * 4, 2, 4, "S");
}

// Official LearnLoop PNG logo
const learnLoopLogo = await new Promise((resolve) => {
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    resolve(canvas.toDataURL("image/png"));
  };

  image.onerror = () => resolve(null);
  image.src = "/learnloop-icon.png.png";
});

if (learnLoopLogo) {
  pdf.addImage(learnLoopLogo, "PNG", 105, 15, 20, 20);
}

// LearnLoop wordmark
pdf.setTextColor(...navy);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(27);
pdf.text("LearnLoop", 132, 28);

pdf.setFont("helvetica", "normal");
pdf.setFontSize(8);
pdf.text("L E A R N  •  S H A R E  •  G R O W", 132, 36);

// Certificate heading
pdf.setFont("times", "bold");
pdf.setFontSize(27);
pdf.text("CERTIFICATE OF COMPLETION", 148.5, 54, {
  align: "center"
});

pdf.setDrawColor(...gold);
pdf.setLineWidth(0.8);
pdf.line(75, 59, 222, 59);

pdf.setFont("helvetica", "normal");
pdf.setFontSize(10);
pdf.text("THIS CERTIFICATE IS PROUDLY PRESENTED TO", 148.5, 69, {
  align: "center"
});

// Learner name panel
pdf.setFillColor(...paleGold);
pdf.setDrawColor(...gold);
pdf.setLineWidth(0.8);
pdf.roundedRect(43, 74, 211, 23, 2, 2, "FD");

pdf.setTextColor(...navy);
pdf.setFont("times", "italic");
pdf.setFontSize(26);
pdf.text(learnerName, 148.5, 89, {
  align: "center",
  maxWidth: 200
});

// Completion statement
pdf.setFont("helvetica", "normal");
pdf.setFontSize(11);
pdf.text("has successfully completed the LearnLoop learning programme", 148.5, 108, {
  align: "center"
});

// Course title banner
pdf.setFillColor(...navy);
pdf.roundedRect(48, 113, 201, 19, 2, 2, "F");

pdf.setTextColor(255, 255, 255);
pdf.setFont("times", "bold");
pdf.setFontSize(21);
pdf.text(course.title, 148.5, 126, {
  align: "center",
  maxWidth: 190
});

// Achievement statement
pdf.setTextColor(...navy);
pdf.setFont("times", "italic");
pdf.setFontSize(11);
pdf.text("Through dedication, curiosity and commitment,", 148.5, 141, {
  align: "center"
});
pdf.text("the learner has demonstrated a passion for lifelong learning.", 148.5, 148, {
  align: "center"
});

// QR verification
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

// QR panel
pdf.setFillColor(255, 255, 255);
pdf.setDrawColor(...gold);
pdf.roundedRect(17, 157, 31, 34, 1.5, 1.5, "FD");

pdf.addImage(
  qrCanvas.toDataURL("image/png"),
  "PNG",
  21,
  160,
  23,
  23
);

pdf.setFont("helvetica", "bold");
pdf.setFontSize(5.5);
pdf.setTextColor(...navy);
pdf.text("SCAN TO VERIFY", 32.5, 188, {
  align: "center"
});

// Certificate number
pdf.setFont("helvetica", "normal");
pdf.setFontSize(8);
pdf.text("CERTIFICATE NUMBER", 83, 164, {
  align: "center"
});

pdf.setFont("helvetica", "bold");
pdf.setFontSize(10);
pdf.text(certificateNumber, 83, 173, {
  align: "center",
  maxWidth: 60
});

// Completion date
pdf.setFont("helvetica", "normal");
pdf.setFontSize(8);
pdf.text("DATE OF COMPLETION", 148, 164, {
  align: "center"
});

pdf.setFont("helvetica", "bold");
pdf.setFontSize(10);
pdf.text(completionDate, 148, 173, {
  align: "center"
});

// LearnLoop certificate signatory areas
// Decorative digital marks — not substitutes for verified personal signatures.
pdf.setDrawColor(...navy);
pdf.setLineWidth(0.75);

// Administrator decorative signature mark
pdf.lines([
  [4, 9, 8, 1, 13, 3],
  [13, 3, 17, 5, 19, 9],
  [19, 9, 23, 13, 27, 6],
  [27, 6, 31, 0, 35, 4],
  [35, 4, 39, 7, 44, 2]
], 187, 158, 1, "S", false);

// Moderator decorative signature mark
pdf.lines([
  [3, 8, 7, 2, 11, 5],
  [11, 5, 15, 8, 18, 3],
  [18, 3, 22, 0, 25, 5],
  [25, 5, 29, 11, 33, 5],
  [33, 5, 38, 0, 44, 4]
], 240, 158, 1, "S", false);

// Signature lines
pdf.setDrawColor(...gold);
pdf.setLineWidth(0.6);
pdf.line(186, 174, 236, 174);
pdf.line(239, 174, 287, 174);

// Names below the lines
pdf.setTextColor(...navy);
pdf.setFont("times", "bold");
pdf.setFontSize(9);
pdf.text("MFITUMUKIZA Elise", 211, 181, {
  align: "center"
});
pdf.text("NAHIMANA Moise", 263, 181, {
  align: "center"
});

// Official titles
pdf.setFont("helvetica", "bold");
pdf.setFontSize(6.2);
pdf.text("DIRECTOR & PLATFORM ADMINISTRATOR", 211, 187, {
  align: "center",
  maxWidth: 50
});
pdf.text("EDUCATION & COMMUNITY MODERATOR", 263, 187, {
  align: "center",
  maxWidth: 50
});

// LearnLoop award seal
pdf.setFillColor(...gold);
pdf.circle(148.5, 181, 8, "F");

pdf.setDrawColor(...navy);
pdf.setLineWidth(0.8);
pdf.circle(148.5, 181, 6.5, "S");

pdf.setTextColor(...navy);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(8);
pdf.text("LL", 148.5, 183.5, {
  align: "center"
});

// Website footer
pdf.setDrawColor(...gold);
pdf.setLineWidth(0.5);
pdf.line(95, 194, 202, 194);

pdf.setFont("helvetica", "normal");
pdf.setFontSize(7);
pdf.setTextColor(...navy);
pdf.text("LEARN • SHARE • GROW  |  elise-neon.vercel.app", 148.5, 198, {
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
// Close the quiz window and stop its timer
document.querySelector("#closeAcademyQuizDialog")
  ?.addEventListener("click", () => {
    if (academyQuizTimer) {
      clearInterval(academyQuizTimer);
      academyQuizTimer = null;
    }

    document.querySelector("#academyQuizDialog")?.close();
  });
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
     let certificate;
let honorary = certificateNumber.startsWith("LL-HON-");

if (honorary) {
  const { data, error } = await supabase.rpc(
    "verify_honorary_certificate",
    { p_certificate_number: certificateNumber }
  );

  if (error) throw error;
  certificate = Array.isArray(data) ? data[0] : data;
} else {
  const { data, error } = await supabase.rpc(
    "verify_learnloop_certificate",
    { p_certificate_number: certificateNumber }
  );

  if (error) throw error;
  certificate = Array.isArray(data) ? data[0] : data;
}

result.replaceChildren();

if (!certificate) {
  result.textContent =
    "Certificate not found. No matching official LearnLoop record was found.";
  return;
}

const heading = document.createElement("h3");
heading.textContent = "Certificate verified";

const details = document.createElement("p");

details.textContent = honorary
  ? `Learner: ${certificate.learner_name} | Course: ${certificate.course_title} | Award: Honorary Participation | Date: ${certificate.completion_date}`
  : `Learner: ${certificate.learner_name} | Course: ${certificate.course_title} | Score: ${certificate.score}/20 | Completion date: ${certificate.completion_date}`;

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

const certificateParams = new URLSearchParams(window.location.search);

const certificateFromQR =
  certificateParams.get("certificate") ||
  certificateParams.get("honorary_certificate");
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
// Weekly committee reports
const weeklyReportsButton = document.getElementById(
  "loadCommitteeWeeklyReports"
);

if (weeklyReportsButton) {
  weeklyReportsButton.addEventListener("click", () => {
    loadCommitteeWeeklyReports();
  });
}

// Set the current week automatically
const committeeWeekInput = document.getElementById("committeeReportWeek");

if (committeeWeekInput && !committeeWeekInput.value) {
  const now = new Date();
  const date = new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ));

  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    (((date - yearStart) / 86400000) + 1) / 7
  );

  committeeWeekInput.value =
    date.getUTCFullYear() + "-W" + String(weekNumber).padStart(2, "0");
}
/* LearnLoop dark mode toggle */
(() => {
  const button = document.querySelector("#themeToggleButton");
  if (!button) return;

  const savedTheme = localStorage.getItem("learnloop-theme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }

  function updateThemeButton() {
    const isDark = document.body.classList.contains("dark-mode");

    button.textContent = isDark ? "☀️ Light mode" : "🌙 Dark mode";
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
    button.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  }

  updateThemeButton();

  button.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-mode");

    localStorage.setItem("learnloop-theme", isDark ? "dark" : "light");

    updateThemeButton();
  });
})();
