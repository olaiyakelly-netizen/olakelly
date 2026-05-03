(function () {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }

  const loginForm = document.getElementById("adminLoginForm");
  const passkeyLoginBtn = document.getElementById("adminPasskeyLoginBtn");
  const loginPanel = document.getElementById("adminLoginPanel");
  const loginMessage = document.getElementById("adminLoginMessage");
  const editorShell = document.getElementById("adminEditorShell");
  const editorForm = document.getElementById("ideasAdminForm");
  const editorMessage = document.getElementById("adminEditorMessage");
  const deployStatusMessage = document.getElementById("adminDeployStatus");
  const draftStateIndicator = document.getElementById("draftStateIndicator");
  const publishPreviewState = document.getElementById("publishPreviewState");
  const publishPreviewBranch = document.getElementById("publishPreviewBranch");
  const publishPreviewCommit = document.getElementById("publishPreviewCommit");
  const publishPreviewChecked = document.getElementById("publishPreviewChecked");
  const publishPreviewElapsedWrap = document.getElementById("publishPreviewElapsedWrap");
  const publishPreviewElapsed = document.getElementById("publishPreviewElapsed");
  const publishPreviewPrLink = document.getElementById("publishPreviewPrLink");
  const publishPreviewOpenLink = document.getElementById("publishPreviewOpenLink");
  const publishPreviewPlaceholder = document.getElementById("publishPreviewPlaceholder");
  const publishPreviewFrame = document.getElementById("publishPreviewFrame");
  const securityEventsPanel = document.getElementById("adminSecurityEvents");
  const stepUpModal = document.getElementById("adminStepUpModal");
  const stepUpConfirmBtn = document.getElementById("adminStepUpConfirmBtn");
  const stepUpCancelBtn = document.getElementById("adminStepUpCancelBtn");
  const stepUpMessage = document.getElementById("adminStepUpMessage");
  const previewButton = document.getElementById("previewPostBtn");
  const logoutButton = document.getElementById("adminLogoutBtn");
  const previewFrame = document.getElementById("previewFrame");
  const previewPlaceholder = document.getElementById("previewPlaceholder");
  const previewError = document.getElementById("previewError");
  const previewSlug = document.getElementById("previewSlug");
  const previewReadTime = document.getElementById("previewReadTime");
  const previewWordCount = document.getElementById("previewWordCount");
  const editorHeading = document.getElementById("editorHeading");
  const editingStateLabel = document.getElementById("editingStateLabel");
  const titleInput = document.getElementById("postTitle");
  const slugInput = document.getElementById("postSlug");
  const postContent = document.getElementById("postContent");
  const formatButtons = Array.from(document.querySelectorAll("[data-format-action]"));
  const editSlugBtn = document.getElementById("editSlugBtn");
  const originalSlugInput = document.getElementById("originalSlug");
  const publishedSlugInput = document.getElementById("publishedSlug");
  const postIdInput = document.getElementById("postId");
  const draftIdInput = document.getElementById("draftId");
  const coverImagePathInput = document.getElementById("coverImagePath");
  const relatedPostsInput = document.getElementById("relatedPostsInput");
  const statusInput = document.getElementById("postStatus");
  const publishPostBtn = document.getElementById("publishPostBtn");
  const homepageFeaturedInput = document.querySelector('input[name="homepage_featured"]');
  const homepageOrderInput = document.getElementById("homepageOrderInput");
  const saveStatus = document.getElementById("saveStatus");
  const adminThemeToggle = document.getElementById("adminThemeToggle");
  const existingPostSlugInput = document.getElementById("existingPostSlug");
  const loadExistingPostBtn = document.getElementById("loadExistingPostBtn");
  const loadExistingPostMessage = document.getElementById("loadExistingPostMessage");
  const recentPostsSelect = document.getElementById("recentPostsSelect");
  const coverImageFileInput = editorForm?.querySelector('input[name="cover_image_file"]');
  const htmlElement = document.documentElement;
  const bodyElement = document.body;

  let slugManuallyEdited = false;
  let previewDebounceTimer = null;
  let lastSavedAt = null;
  let lastSaveLabel = "Saved";
  let saveStatusTimer = null;
  let deploymentPollTimer = null;
  let deploymentPollAttempts = 0;
  let latestPreviewRequest = 0;
  let cleanSnapshot = null;
  let editingExisting = false;
  let loadedPostWasPublished = false;
  let slugUnlockedForSession = false;
  let csrfToken = "";
  let nextNonce = "";
  let publishPreviewPollTimer = null;
  let publishPreviewStartedAt = null;
  let publishPreviewBranchValue = "";
  let lastPublishedPayloadHash = "";
  let pendingStepUpResolve = null;
  let pendingStepUpContext = null;

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildMessageHtml(message, links = []) {
    const linkMarkup = links
      .filter((link) => link && link.href && link.label)
      .map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`)
      .join(" ");

    return linkMarkup ? `${escapeHtml(message)} ${linkMarkup}` : escapeHtml(message);
  }

  function setMessage(target, message, isError, links = []) {
    if (!target) return;
    target.innerHTML = buildMessageHtml(message || "", links);
    target.classList.toggle("is-error", Boolean(isError));
  }

  function stopDeploymentPolling() {
    if (deploymentPollTimer) {
      window.clearTimeout(deploymentPollTimer);
      deploymentPollTimer = null;
    }
    deploymentPollAttempts = 0;
  }

  function setDeploymentStatus(message, isError, links = []) {
    setMessage(deployStatusMessage, message, isError, links);
  }

  async function fetchDeploymentStatus() {
    return requestApi("/api/admin/deploy-status", { method: "GET" });
  }

  function shouldContinueDeploymentPolling(status) {
    return ["QUEUED", "INITIALIZING", "BUILDING", "UNKNOWN"].includes(String(status || "").toUpperCase());
  }

  async function pollDeploymentStatus() {
    try {
      const data = await fetchDeploymentStatus();
      if (!data.deployment_status_available) {
        setDeploymentStatus(data.deployment_status_message || "Deployment status is unavailable.", true);
        stopDeploymentPolling();
        return;
      }

      setDeploymentStatus(
        data.deployment_status_message || data.deployment_status_label || "Deployment status updated.",
        ["ERROR", "CANCELED"].includes(String(data.deployment_status || "").toUpperCase()),
        [data.deployment_url ? { href: data.deployment_url, label: "Open Deployment" } : null]
      );

      if (!shouldContinueDeploymentPolling(data.deployment_status) || deploymentPollAttempts >= 30) {
        stopDeploymentPolling();
        return;
      }
    } catch (error) {
      setDeploymentStatus(error.message || "Unable to load deployment status.", true);
      stopDeploymentPolling();
      return;
    }

    deploymentPollAttempts += 1;
    deploymentPollTimer = window.setTimeout(pollDeploymentStatus, 4000);
  }

  function startDeploymentPolling(initialMessage, links = []) {
    stopDeploymentPolling();
    setDeploymentStatus(initialMessage || "Deploy triggered", false, links);
    deploymentPollAttempts = 0;
    deploymentPollTimer = window.setTimeout(pollDeploymentStatus, 2500);
  }

  function syncThemeToggle() {
    if (!adminThemeToggle) return;
    const isDarkMode = htmlElement.classList.contains("dark-mode");
    adminThemeToggle.classList.toggle("dark", isDarkMode);
    adminThemeToggle.setAttribute("aria-label", isDarkMode ? "Switch to light mode" : "Switch to dark mode");
  }

  function setTheme(isDarkMode) {
    htmlElement.classList.toggle("dark-mode", isDarkMode);
    bodyElement.classList.toggle("dark-mode", isDarkMode);
    localStorage.setItem("darkMode", isDarkMode ? "true" : "false");
    syncThemeToggle();
  }

  function toggleTheme() {
    setTheme(!htmlElement.classList.contains("dark-mode"));
  }

  function loadThemePreference() {
    const storedPreference = localStorage.getItem("darkMode");
    setTheme(storedPreference !== "false");
  }

  function syncEditorHeading() {
    if (!editorHeading || !titleInput) return;
    editorHeading.textContent = titleInput.value.trim() || "New Idea";
  }

  function setPreviewPlaceholderState() {
    previewPlaceholder?.classList.remove("is-hidden");
    previewError?.classList.add("is-hidden");
    previewFrame?.classList.add("is-hidden");
  }

  function setPreviewRenderedState(html) {
    if (previewFrame) {
      previewFrame.srcdoc = html || "";
    }
    previewPlaceholder?.classList.add("is-hidden");
    previewError?.classList.add("is-hidden");
    previewFrame?.classList.toggle("is-hidden", !html);
  }

  function setPreviewErrorState(message) {
    if (previewFrame) {
      previewFrame.srcdoc = "";
    }
    if (previewError) {
      previewError.textContent = message || "Preview could not be generated.";
    }
    previewPlaceholder?.classList.add("is-hidden");
    previewError?.classList.remove("is-hidden");
    previewFrame?.classList.add("is-hidden");
  }

  function derivePreviewExcerpt(content) {
    return String(content || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(^|\n)\s{0,3}(#{1,6}|\*|-|\+|\d+\.)\s+/g, " ")
      .replace(/(^|\n)\s{0,3}>\s?/g, " ")
      .replace(/[*_~>#-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  function updateContentSelection(nextValue, nextStart, nextEnd = nextStart) {
    if (!postContent) return;
    postContent.value = nextValue;
    postContent.focus();
    postContent.setSelectionRange(nextStart, nextEnd);
    postContent.dispatchEvent(new Event("input", { bubbles: true }));
    schedulePreview();
  }

  function getTextareaSelection() {
    if (!postContent) {
      return {
        value: "",
        selectionStart: 0,
        selectionEnd: 0
      };
    }

    return {
      value: postContent.value,
      selectionStart: postContent.selectionStart,
      selectionEnd: postContent.selectionEnd
    };
  }

  function getCurrentLineInfo() {
    const { value, selectionStart, selectionEnd } = getTextareaSelection();
    const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const lineEndIndex = value.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const currentLine = value.slice(lineStart, lineEnd);

    return {
      value,
      selectionStart,
      selectionEnd,
      lineStart,
      lineEnd,
      currentLine,
      caretOffset: selectionStart - lineStart
    };
  }

  function isWrappedWith(value, selectionStart, selectionEnd, prefix, suffix) {
    if (selectionStart < prefix.length || selectionEnd + suffix.length > value.length) {
      return false;
    }

    return (
      value.slice(selectionStart - prefix.length, selectionStart) === prefix &&
      value.slice(selectionEnd, selectionEnd + suffix.length) === suffix
    );
  }

  function applyToggleWrap(prefix, suffix, { disallowAdjacent = [] } = {}) {
    const { value, selectionStart, selectionEnd } = getTextareaSelection();
    const selectedText = value.slice(selectionStart, selectionEnd);

    if (!selectedText) {
      const replacement = `${prefix}${suffix}`;
      const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
      const nextStart = selectionStart + prefix.length;
      updateContentSelection(nextValue, nextStart, nextStart);
      return;
    }

    if (isWrappedWith(value, selectionStart, selectionEnd, prefix, suffix)) {
      const wrappedStart = selectionStart - prefix.length;
      const wrappedEnd = selectionEnd + suffix.length;
      const replacement = value.slice(selectionStart, selectionEnd);
      const nextValue = `${value.slice(0, wrappedStart)}${replacement}${value.slice(wrappedEnd)}`;
      updateContentSelection(nextValue, wrappedStart, wrappedStart + replacement.length);
      return;
    }

    const before = value.charAt(selectionStart - 1);
    const after = value.charAt(selectionEnd);
    if (disallowAdjacent.includes(before) || disallowAdjacent.includes(after)) {
      updateContentSelection(value, selectionStart, selectionEnd);
      return;
    }

    const replacement = `${prefix}${selectedText}${suffix}`;
    const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
    const nextStart = selectionStart + prefix.length;
    const nextEnd = nextStart + selectedText.length;
    updateContentSelection(nextValue, nextStart, nextEnd);
  }

  function isExactlyItalicWrapped(value, selectionStart, selectionEnd) {
    if (!isWrappedWith(value, selectionStart, selectionEnd, "*", "*")) return false;
    const beforeOpening = value.charAt(selectionStart - 2);
    const afterClosing = value.charAt(selectionEnd + 1);
    return beforeOpening !== "*" && afterClosing !== "*";
  }

  function applyItalicToggle() {
    const { value, selectionStart, selectionEnd } = getTextareaSelection();
    const selectedText = value.slice(selectionStart, selectionEnd);

    if (!selectedText) {
      const replacement = "**";
      const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
      updateContentSelection(nextValue, selectionStart + 1, selectionStart + 1);
      return;
    }

    if (isExactlyItalicWrapped(value, selectionStart, selectionEnd)) {
      const wrappedStart = selectionStart - 1;
      const wrappedEnd = selectionEnd + 1;
      const nextValue = `${value.slice(0, wrappedStart)}${selectedText}${value.slice(wrappedEnd)}`;
      updateContentSelection(nextValue, wrappedStart, wrappedStart + selectedText.length);
      return;
    }

    const before = value.charAt(selectionStart - 1);
    const after = value.charAt(selectionEnd);
    if (before === "*" || after === "*") {
      updateContentSelection(value, selectionStart, selectionEnd);
      return;
    }

    const replacement = `*${selectedText}*`;
    const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
    updateContentSelection(nextValue, selectionStart + 1, selectionStart + 1 + selectedText.length);
  }

  function applyLinkFormat() {
    const { value, selectionStart, selectionEnd } = getTextareaSelection();
    const selectedText = value.slice(selectionStart, selectionEnd);

    if (selectedText) {
      const replacement = `[${selectedText}](url)`;
      const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
      const urlStart = selectionStart + selectedText.length + 3;
      updateContentSelection(nextValue, urlStart, urlStart);
      return;
    }

    const replacement = "[text](url)";
    const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
    updateContentSelection(nextValue, selectionStart + 1, selectionStart + 5);
  }

  function applyLinePrefixToggle(prefix) {
    const { value, selectionStart, lineStart, lineEnd, currentLine } = getCurrentLineInfo();

    if (currentLine.startsWith(prefix)) {
      const nextValue = `${value.slice(0, lineStart)}${currentLine.slice(prefix.length)}${value.slice(lineEnd)}`;
      const nextCaret = Math.max(lineStart, selectionStart - prefix.length);
      updateContentSelection(nextValue, nextCaret, nextCaret);
      return;
    }

    const nextValue = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    const nextCaret = selectionStart + prefix.length;
    updateContentSelection(nextValue, nextCaret, nextCaret);
  }

  function continueMarkdownLine(prefix, nextPrefix) {
    const { value, lineStart, lineEnd, currentLine, caretOffset } = getCurrentLineInfo();
    const afterPrefix = currentLine.slice(prefix.length);
    const beforeCaret = currentLine.slice(0, caretOffset);
    const afterCaret = currentLine.slice(caretOffset);

    if (!afterPrefix.trim()) {
      const nextValue = `${value.slice(0, lineStart)}${value.slice(lineEnd)}`;
      updateContentSelection(nextValue, lineStart, lineStart);
      return true;
    }

    const insertion = `\n${nextPrefix}`;
    const caretPosition = lineStart + beforeCaret.length + insertion.length;
    const nextValue = `${value.slice(0, lineStart)}${beforeCaret}${insertion}${afterCaret}${value.slice(lineEnd)}`;
    updateContentSelection(nextValue, caretPosition, caretPosition);
    return true;
  }

  function handleEditorEnter(event) {
    if (!postContent || event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const { selectionStart, selectionEnd, currentLine } = getCurrentLineInfo();
    if (selectionStart !== selectionEnd) return;

    if (currentLine.startsWith("- ")) {
      event.preventDefault();
      continueMarkdownLine("- ", "- ");
      return;
    }

    const numberedMatch = currentLine.match(/^(\d+)\.\s/);
    if (numberedMatch) {
      event.preventDefault();
      const currentNumber = Number(numberedMatch[1]);
      continueMarkdownLine(numberedMatch[0], `${currentNumber + 1}. `);
      return;
    }

    if (currentLine.startsWith("> ")) {
      event.preventDefault();
      continueMarkdownLine("> ", "> ");
    }
  }

  function applyDivider() {
    const { value, selectionStart, selectionEnd } = getTextareaSelection();
    const replacement = "\n---\n";
    const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
    const nextCaret = selectionStart + replacement.length;
    updateContentSelection(nextValue, nextCaret, nextCaret);
  }

  function applyMarkdownFormat(action) {
    if (!postContent) return;

    switch (action) {
      case "bold":
        applyToggleWrap("**", "**");
        return;
      case "italic":
        applyItalicToggle();
        return;
      case "link":
        applyLinkFormat();
        return;
      case "heading":
        applyLinePrefixToggle("## ");
        return;
      case "bullet":
        applyLinePrefixToggle("- ");
        return;
      case "numbered":
        applyLinePrefixToggle("1. ");
        return;
      case "quote":
        applyLinePrefixToggle("> ");
        return;
      case "divider":
        applyDivider();
        return;
      default:
    }
  }

  function clearPreview() {
    if (previewFrame) previewFrame.srcdoc = "";
    if (previewError) previewError.textContent = "Preview could not be generated.";
    previewSlug.textContent = "-";
    previewReadTime.textContent = "-";
    previewWordCount.textContent = "-";
    setPreviewPlaceholderState();
  }

  function updateSaveStatus() {
    if (!saveStatus) return;
    if (!lastSavedAt) {
      saveStatus.textContent = "";
      return;
    }

    const elapsedMinutes = Math.floor((Date.now() - lastSavedAt.getTime()) / 60000);
    saveStatus.textContent = elapsedMinutes <= 0 ? `${lastSaveLabel} just now` : `${lastSaveLabel} ${elapsedMinutes} min ago`;
  }

  function markSavedNow(label) {
    lastSaveLabel = label || "Saved";
    lastSavedAt = new Date();
    updateSaveStatus();
    if (saveStatusTimer) {
      window.clearInterval(saveStatusTimer);
    }
    saveStatusTimer = window.setInterval(updateSaveStatus, 60000);
  }

  function syncHomepageOrderState() {
    if (!homepageFeaturedInput || !homepageOrderInput) return;
    const isEnabled = homepageFeaturedInput.checked;
    homepageOrderInput.disabled = !isEnabled;
    if (!isEnabled) {
      homepageOrderInput.value = "";
    }
  }

  function syncSlugLockState() {
    const shouldLockSlug = loadedPostWasPublished && !slugUnlockedForSession;
    slugInput.disabled = shouldLockSlug;
    editSlugBtn?.classList.toggle("is-hidden", !loadedPostWasPublished);
  }

  function setEditingState(slug) {
    editingExisting = Boolean(slug);
    if (!editingStateLabel) return;
    editingStateLabel.classList.toggle("is-hidden", !editingExisting);
    editingStateLabel.textContent = editingExisting ? `Editing: ${slug}` : "";
  }

  function setEditorAuthenticated(isAuthenticated) {
    logoutButton?.classList.toggle("is-hidden", !isAuthenticated);
    loginPanel?.classList.toggle("is-hidden", isAuthenticated);
    editorShell?.classList.toggle("is-hidden", !isAuthenticated);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function getHiddenRelatedPosts() {
    try {
      return JSON.parse(relatedPostsInput?.value || "[]");
    } catch (_error) {
      return [];
    }
  }

  function setPublishPreviewState(state, details = {}) {
    if (publishPreviewState) publishPreviewState.textContent = state || "Not published";
    if (publishPreviewBranch) publishPreviewBranch.textContent = details.branch || publishPreviewBranch.textContent || "-";
    if (publishPreviewCommit) publishPreviewCommit.textContent = details.commit_sha ? details.commit_sha.slice(0, 7) : (publishPreviewCommit.textContent || "-");
    if (publishPreviewChecked) publishPreviewChecked.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (details.pr_url && publishPreviewPrLink) {
      publishPreviewPrLink.href = details.pr_url;
      publishPreviewPrLink.classList.remove("is-hidden");
    }
    if (details.preview_url && publishPreviewOpenLink) {
      publishPreviewOpenLink.href = details.preview_url;
      publishPreviewOpenLink.classList.remove("is-hidden");
    }
    if (details.show_elapsed && publishPreviewElapsedWrap && publishPreviewElapsed) {
      publishPreviewElapsedWrap.classList.remove("is-hidden");
      publishPreviewElapsed.textContent = `${Math.floor((details.elapsed_ms || 0) / 1000)}s`;
    }
  }

  function stopPublishPreviewPolling() {
    if (publishPreviewPollTimer) {
      window.clearTimeout(publishPreviewPollTimer);
      publishPreviewPollTimer = null;
    }
  }

  function showPublishPreviewBlocked(url) {
    setPublishPreviewState("Blocked", { preview_url: url });
    publishPreviewFrame?.classList.add("is-hidden");
    publishPreviewPlaceholder?.classList.remove("is-hidden");
    if (publishPreviewPlaceholder) publishPreviewPlaceholder.textContent = "Preview cannot be embedded here. Open it in a new tab.";
  }

  function renderPublishPreviewUrl(url) {
    if (!url || !publishPreviewFrame) return;
    publishPreviewPlaceholder?.classList.add("is-hidden");
    publishPreviewFrame.classList.remove("is-hidden");
    publishPreviewFrame.src = url;
    const blockedTimer = window.setTimeout(() => {
      showPublishPreviewBlocked(url);
    }, 4000);
    publishPreviewFrame.onload = () => {
      window.clearTimeout(blockedTimer);
    };
  }

  async function pollPublishPreview() {
    if (!publishPreviewBranchValue || !publishPreviewStartedAt) return;
    try {
      const data = await requestApi(`/api/admin/publish-preview?branch=${encodeURIComponent(publishPreviewBranchValue)}&started_at=${publishPreviewStartedAt}`, {
        method: "GET"
      });
      setPublishPreviewState(data.state, {
        branch: data.branch,
        preview_url: data.preview_url,
        elapsed_ms: data.elapsed_ms,
        show_elapsed: data.show_elapsed
      });
      if (data.state === "Ready" && data.preview_url) {
        renderPublishPreviewUrl(data.preview_url);
        publishPreviewPollTimer = window.setTimeout(pollPublishPreview, 30000);
        return;
      }
      if (["Failed", "Stalled"].includes(data.state)) {
        stopPublishPreviewPolling();
        return;
      }
      publishPreviewPollTimer = window.setTimeout(pollPublishPreview, 5000);
    } catch (error) {
      setPublishPreviewState("Failed");
      if (publishPreviewPlaceholder) publishPreviewPlaceholder.textContent = error.message || "Preview status could not be loaded.";
      stopPublishPreviewPolling();
    }
  }

  function startPublishPreviewPolling(data) {
    stopPublishPreviewPolling();
    publishPreviewBranchValue = data.branch || "";
    publishPreviewStartedAt = data.preview_started_at || Date.now();
    setPublishPreviewState(data.preview_status || "Preview queued", {
      branch: data.branch,
      commit_sha: data.commit_sha,
      pr_url: data.pr_url
    });
    if (publishPreviewPlaceholder) publishPreviewPlaceholder.textContent = "Waiting for Vercel preview...";
    publishPreviewPollTimer = window.setTimeout(pollPublishPreview, 5000);
  }

  async function hashPayload(payload) {
    const encoded = new TextEncoder().encode(JSON.stringify(payload || {}));
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function refreshSecurityState() {
    const data = await fetch("/api/admin/security", { credentials: "same-origin" }).then((response) => response.json());
    csrfToken = data.csrf || csrfToken;
    nextNonce = data.nonce || nextNonce;
    renderSecurityEvents(Array.isArray(data.security_events) ? data.security_events : []);
    return data;
  }

  function renderSecurityEvents(events) {
    if (!securityEventsPanel) return;
    if (!events.length) {
      securityEventsPanel.innerHTML = `<p class="admin-preview-placeholder">No high-signal events in the last hour.</p>`;
      return;
    }
    securityEventsPanel.innerHTML = events.slice(0, 10).map((event) => {
      const time = new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return `<div class="admin-security-event"><span>${escapeHtml(event.type)}</span><strong>${escapeHtml(time)}</strong></div>`;
    }).join("");
  }

  function updateDraftStateIndicator(state) {
    if (!draftStateIndicator) return;
    draftStateIndicator.textContent = state || "Current Draft";
  }

  function getSelectedTags() {
    return Array.from(editorForm?.querySelectorAll('input[name="tags"]:checked') || [])
      .map((input) => String(input.value || "").trim())
      .filter(Boolean);
  }

  function setSelectedTags(tags) {
    const selectedTags = new Set(Array.isArray(tags) ? tags : []);
    Array.from(editorForm?.querySelectorAll('input[name="tags"]') || []).forEach((input) => {
      input.checked = selectedTags.has(input.value);
    });
  }

  function getNormalizedEditorState() {
    const formData = new FormData(editorForm);
    const file = formData.get("cover_image_file");

    return {
      id: String(formData.get("id") || "").trim(),
      draft_id: String(formData.get("draft_id") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      subtitle: String(formData.get("subtitle") || "").trim(),
      slug: String(formData.get("slug") || "").trim(),
      original_slug: String(formData.get("original_slug") || "").trim(),
      published_slug: String(formData.get("published_slug") || "").trim(),
      category: String(formData.get("category") || "").trim(),
      tags: getSelectedTags(),
      excerpt: String(formData.get("excerpt") || "").trim(),
      intent: String(formData.get("intent") || "").trim(),
      featured: formData.get("featured") === "on",
      homepage_featured: formData.get("homepage_featured") === "on",
      homepage_order: String(formData.get("homepage_order") || "").trim(),
      status: String(formData.get("status") || "draft"),
      date: String(formData.get("date") || "").trim(),
      show_date: formData.get("show_date") === "on",
      show_updated_date: formData.get("show_updated_date") === "on",
      seo_title: String(formData.get("seo_title") || "").trim(),
      seo_description: String(formData.get("seo_description") || "").trim(),
      canonical_url: String(formData.get("canonical_url") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      cover_image: String(formData.get("cover_image") || "").trim(),
      cover_image_alt: String(formData.get("cover_image_alt") || "").trim(),
      related_posts: getHiddenRelatedPosts(),
      has_cover_image_upload: file instanceof File && file.size > 0,
      editing_existing: editingExisting,
      loaded_post_was_published: loadedPostWasPublished,
      slug_unlocked_for_session: slugUnlockedForSession
    };
  }

  function snapshotIsDirty() {
    if (!cleanSnapshot) return false;
    return JSON.stringify(getNormalizedEditorState()) !== JSON.stringify(cleanSnapshot);
  }

  function refreshCleanSnapshot() {
    cleanSnapshot = getNormalizedEditorState();
  }

  async function getFormPayload() {
    const formData = new FormData(editorForm);
    const file = formData.get("cover_image_file");

    return {
      id: String(formData.get("id") || "").trim(),
      draft_id: String(formData.get("draft_id") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      subtitle: String(formData.get("subtitle") || "").trim(),
      slug: String(formData.get("slug") || "").trim(),
      original_slug: String(formData.get("original_slug") || "").trim(),
      published_slug: String(formData.get("published_slug") || "").trim(),
      category: String(formData.get("category") || "").trim(),
      tags: getSelectedTags(),
      excerpt: String(formData.get("excerpt") || "").trim(),
      intent: String(formData.get("intent") || "").trim(),
      featured: formData.get("featured") === "on",
      homepage_featured: formData.get("homepage_featured") === "on",
      homepage_order: String(formData.get("homepage_order") || "").trim(),
      status: String(formData.get("status") || "draft"),
      date: String(formData.get("date") || "").trim(),
      show_date: formData.get("show_date") === "on",
      show_updated_date: formData.get("show_updated_date") === "on",
      seo_title: String(formData.get("seo_title") || "").trim(),
      seo_description: String(formData.get("seo_description") || "").trim(),
      canonical_url: String(formData.get("canonical_url") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      cover_image: String(formData.get("cover_image") || "").trim(),
      cover_image_alt: String(formData.get("cover_image_alt") || "").trim(),
      related_posts: getHiddenRelatedPosts(),
      cover_image_data: file instanceof File && file.size > 0 ? await readFileAsDataUrl(file) : ""
    };
  }

  async function requestApi(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    if (method !== "GET" && (!csrfToken || !nextNonce)) {
      await refreshSecurityState();
    }
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        ...(method !== "GET" && nextNonce ? { "X-Request-Nonce": nextNonce } : {}),
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      data = {
        error: response.ok ? "" : "The server returned an unreadable response. Check the function logs for details."
      };
    }
    if (method !== "GET") {
      nextNonce = "";
      refreshSecurityState().catch(() => {});
    }
    if (!response.ok) {
      const error = new Error(data.error || "Request failed.");
      error.statusCode = response.status;
      throw error;
    }
    return data;
  }

  function formatRecentPostOption(post) {
    const title = String(post.title || "").trim();
    const slug = String(post.slug || "").trim();
    const status = String(post.status || "").trim();
    const readableStatus = status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "";
    const compactTitle = title.length > 52 ? `${title.slice(0, 49)}...` : title;
    return `${compactTitle} - ${slug}${readableStatus ? ` (${readableStatus})` : ""}`;
  }

  function populateRecentPostsDropdown(recentPosts) {
    if (!recentPostsSelect) return;
    recentPostsSelect.innerHTML = `<option value="">Select a recent post</option>`;

    recentPosts.forEach((post) => {
      const option = document.createElement("option");
      option.value = post.slug;
      option.textContent = formatRecentPostOption(post);
      recentPostsSelect.appendChild(option);
    });
  }

  async function loadRecentPosts() {
    const data = await requestApi("/api/admin/post", { method: "GET" });
    populateRecentPostsDropdown(Array.isArray(data.recent_posts) ? data.recent_posts : []);
  }

  function resetLoadedSourceFields() {
    if (postIdInput) postIdInput.value = "";
    if (draftIdInput) draftIdInput.value = "";
    if (originalSlugInput) originalSlugInput.value = "";
    if (publishedSlugInput) publishedSlugInput.value = "";
    if (coverImagePathInput) coverImagePathInput.value = "";
    if (relatedPostsInput) relatedPostsInput.value = "[]";
  }

  function setLoadedPostMode(post) {
    loadedPostWasPublished = post.status === "published";
    slugUnlockedForSession = false;
    slugManuallyEdited = false;
    syncSlugLockState();
    setEditingState(post.slug);
  }

  function setNewPostMode() {
    editingExisting = false;
    loadedPostWasPublished = false;
    slugUnlockedForSession = false;
    slugManuallyEdited = false;
    slugInput.disabled = false;
    editSlugBtn?.classList.add("is-hidden");
    setEditingState("");
  }

  function scrollEditorToTop() {
    editorHeading?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function populateForm(post) {
    resetLoadedSourceFields();

    if (postIdInput) postIdInput.value = post.id || "";
    if (originalSlugInput) originalSlugInput.value = post.slug || "";
    if (publishedSlugInput) publishedSlugInput.value = post.status === "published" ? (post.slug || "") : "";
    if (coverImagePathInput) coverImagePathInput.value = post.cover_image || "";
    if (relatedPostsInput) relatedPostsInput.value = JSON.stringify(Array.isArray(post.related_posts) ? post.related_posts : []);
    if (titleInput) titleInput.value = post.title || "";

    const mappings = [
      ["subtitle", post.subtitle],
      ["slug", post.slug],
      ["category", post.category],
      ["excerpt", post.excerpt],
      ["intent", post.intent],
      ["status", post.status],
      ["date", String(post.date || "").slice(0, 10)],
      ["homepage_order", post.homepage_order ?? ""],
      ["seo_title", post.seo_title],
      ["seo_description", post.seo_description],
      ["canonical_url", post.canonical_url],
      ["cover_image_alt", post.cover_image_alt],
      ["content", post.content]
    ];

    mappings.forEach(([name, value]) => {
      const field = editorForm?.elements.namedItem(name);
      if (field && "value" in field) {
        field.value = value ?? "";
      }
    });

    const booleanMappings = [
      ["featured", post.featured],
      ["homepage_featured", post.homepage_featured],
      ["show_date", post.show_date],
      ["show_updated_date", post.show_updated_date]
    ];

    booleanMappings.forEach(([name, value]) => {
      const field = editorForm?.elements.namedItem(name);
      if (field && "checked" in field) {
        field.checked = Boolean(value);
      }
    });

    if (coverImageFileInput) {
      coverImageFileInput.value = "";
    }

    setSelectedTags(post.tags);
    syncEditorHeading();
    syncHomepageOrderState();
    setLoadedPostMode(post);
  }

  function applyServerState(data, payload, mode) {
    if (postIdInput && data.id) postIdInput.value = data.id;
    if (draftIdInput && data.draft_id) draftIdInput.value = data.draft_id;
    if (coverImagePathInput) {
      coverImagePathInput.value = data.cover_image || payload.cover_image || "";
    }
    previewSlug.textContent = data.slug || payload.slug || "-";
    previewReadTime.textContent = data.reading_time ? `${data.reading_time} min` : "-";
    previewWordCount.textContent = data.word_count || "-";

    if (mode === "draft") {
      if (originalSlugInput && !originalSlugInput.value) {
        originalSlugInput.value = data.slug || payload.slug || "";
      }
      if (publishedSlugInput) {
        publishedSlugInput.value = data.published_slug || payload.published_slug || "";
      }
      if (!editingExisting) {
        setEditingState(data.slug || payload.slug || "");
      }
      return;
    }

    if (originalSlugInput) originalSlugInput.value = data.slug || payload.slug || "";
    if (publishedSlugInput) publishedSlugInput.value = data.published_slug || data.slug || payload.slug || "";
    loadedPostWasPublished = true;
    slugUnlockedForSession = false;
    slugManuallyEdited = false;
    syncSlugLockState();
    setEditingState(data.slug || payload.slug || "");
    if (existingPostSlugInput) existingPostSlugInput.value = data.slug || payload.slug || "";
  }

  async function runPreview() {
    if (!editorShell || editorShell.classList.contains("is-hidden")) {
      return;
    }

    const payload = await getFormPayload();
    const hasMinimumPreviewContent = Boolean(payload.title?.trim() && payload.content?.trim());

    if (!hasMinimumPreviewContent) {
      clearPreview();
      return;
    }

    if (!payload.excerpt?.trim()) {
      payload.excerpt = derivePreviewExcerpt(payload.content);
    }

    const requestId = Date.now();
    latestPreviewRequest = requestId;

    try {
      const data = await requestApi("/api/admin/preview", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (latestPreviewRequest !== requestId) {
        return;
      }

      if (!data.html) {
        throw new Error("Preview response did not include HTML.");
      }

      previewSlug.textContent = data.slug || "-";
      previewReadTime.textContent = data.reading_time ? `${data.reading_time} min` : "-";
      previewWordCount.textContent = data.word_count || "-";
      setPreviewRenderedState(data.html);
      if (!originalSlugInput.value && data.slug) {
        originalSlugInput.value = data.slug;
      }
    } catch (error) {
      if (latestPreviewRequest !== requestId) return;
      setPreviewErrorState(error.message || "Preview could not be generated.");
    }
  }

  function schedulePreview() {
    if (previewDebounceTimer) {
      window.clearTimeout(previewDebounceTimer);
    }

    previewDebounceTimer = window.setTimeout(async () => {
      try {
        await runPreview();
      } catch (error) {
        setPreviewErrorState(error.message || "Preview could not be generated.");
      }
    }, 450);
  }

  async function loadPost(slug) {
    const normalizedSlug = String(slug || "").trim();
    if (!normalizedSlug) return;

    if (snapshotIsDirty() && !window.confirm("You have unsaved changes. Load another post anyway?")) {
      return;
    }

    setMessage(loadExistingPostMessage, "");

    try {
      const data = await requestApi(`/api/admin/post?slug=${encodeURIComponent(normalizedSlug)}`, { method: "GET" });
      populateForm(data.post || {});
      if (existingPostSlugInput) existingPostSlugInput.value = data.post.slug || normalizedSlug;
      if (recentPostsSelect) recentPostsSelect.value = "";
      refreshCleanSnapshot();
      scrollEditorToTop();
      await runPreview();
    } catch (error) {
      if (error.statusCode === 404) {
        setMessage(loadExistingPostMessage, "No post found for that slug.", true);
        return;
      }
      setMessage(loadExistingPostMessage, error.message, true);
    }
  }

  async function handleLogin(password) {
    await requestApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password,
        totp: document.getElementById("adminTotp")?.value || ""
      })
    });
    setEditorAuthenticated(true);
    await loadRecentPosts();
    refreshCleanSnapshot();
  }

  async function runPasskeyLogin() {
    if (!window.SimpleWebAuthnBrowser?.startAuthentication) {
      throw new Error("Passkey support did not load. Use fallback login.");
    }
    await refreshSecurityState();
    const options = await requestApi("/api/admin/passkey-options", {
      method: "POST",
      body: JSON.stringify({ action: "login" })
    });
    const response = await window.SimpleWebAuthnBrowser.startAuthentication(options.options);
    const verified = await requestApi("/api/admin/passkey-verify", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: options.challenge_id,
        response,
        context: {}
      })
    });
    csrfToken = verified.csrf || csrfToken;
    setEditorAuthenticated(true);
    await loadRecentPosts();
    refreshCleanSnapshot();
  }

  function openStepUpModal() {
    return new Promise((resolve, reject) => {
      pendingStepUpResolve = { resolve, reject };
      stepUpMessage.textContent = "";
      stepUpModal?.classList.remove("is-hidden");
    });
  }

  function closeStepUpModal() {
    stepUpModal?.classList.add("is-hidden");
    pendingStepUpResolve = null;
  }

  async function requestPublishStepUp(payload, nonce) {
    const payloadHash = await hashPayload(payload);
    pendingStepUpContext = {
      action: "publish",
      method: "POST",
      route: "/api/admin/publish",
      target: payload.slug || payload.title,
      payloadHash,
      nonce
    };
    const proof = await openStepUpModal();
    nextNonce = nonce;
    return { proof, payloadHash };
  }

  async function saveDraft() {
    setMessage(editorMessage, "");
    stopDeploymentPolling();
    setDeploymentStatus("");
    const payload = await getFormPayload();
    const data = await requestApi("/api/admin/draft", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    applyServerState(data, payload, "draft");
    markSavedNow("Draft saved");
    refreshCleanSnapshot();
    setMessage(editorMessage, data.message || "Draft saved securely.");
  }

  async function publishPost() {
    setMessage(editorMessage, "");
    setDeploymentStatus("");
    const payload = await getFormPayload();
    const liveSlug = payload.published_slug;

    if (liveSlug && liveSlug !== payload.slug) {
      payload.confirm_slug_change = window.confirm(
        "This post looks like a published slug change. Continue and create a redirect from the old slug?"
      );
      if (!payload.confirm_slug_change) {
        return;
      }
    }

    if (!nextNonce) await refreshSecurityState();
    const stepUp = await requestPublishStepUp(payload, nextNonce);
    const data = await requestApi("/api/admin/publish", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        step_up_proof: stepUp.proof
      })
    });

    applyServerState(data, payload, "publish");
    lastPublishedPayloadHash = data.payload_hash || lastPublishedPayloadHash;
    updateDraftStateIndicator(data.pr_url ? "Published PR Pending" : "Last Published");
    markSavedNow(data.no_changes ? "Checked" : "Published");
    refreshCleanSnapshot();
    await loadRecentPosts();
    setMessage(
      editorMessage,
      data.message || "Published successfully. Vercel will deploy automatically.",
      false,
      [
        data.pr_url ? { href: data.pr_url, label: "Open PR" } : null,
        data.live_url ? { href: data.live_url, label: "View Live" } : null
      ]
    );

    startPublishPreviewPolling(data);
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("adminPassword").value;
    try {
      await handleLogin(password);
      setMessage(loginMessage, "");
    } catch (error) {
      setMessage(loginMessage, error.message, true);
    }
  });

  passkeyLoginBtn?.addEventListener("click", async () => {
    try {
      await runPasskeyLogin();
      setMessage(loginMessage, "");
    } catch (error) {
      setMessage(loginMessage, error.message, true);
    }
  });

  stepUpCancelBtn?.addEventListener("click", () => {
    pendingStepUpResolve?.reject(new Error("Publish confirmation was canceled."));
    closeStepUpModal();
  });

  stepUpConfirmBtn?.addEventListener("click", async () => {
    try {
      if (!pendingStepUpContext) throw new Error("No publish request is waiting for confirmation.");
      if (!window.SimpleWebAuthnBrowser?.startAuthentication) throw new Error("Passkey support did not load.");
      stepUpMessage.textContent = "Waiting for passkey...";
      const options = await requestApi("/api/admin/passkey-options", {
        method: "POST",
        body: JSON.stringify({
          action: pendingStepUpContext.action,
          method: pendingStepUpContext.method,
          route: pendingStepUpContext.route,
          target: pendingStepUpContext.target,
          payload_hash: pendingStepUpContext.payloadHash,
          nonce: pendingStepUpContext.nonce
        })
      });
      const response = await window.SimpleWebAuthnBrowser.startAuthentication(options.options);
      const verified = await requestApi("/api/admin/passkey-verify", {
        method: "POST",
        body: JSON.stringify({
          challenge_id: options.challenge_id,
          response,
          context: pendingStepUpContext
        })
      });
      pendingStepUpResolve?.resolve(verified.proof);
      closeStepUpModal();
    } catch (error) {
      stepUpMessage.textContent = error.message || "Passkey confirmation failed.";
    }
  });

  titleInput?.addEventListener("input", () => {
    if (!slugManuallyEdited && !slugInput.disabled) {
      slugInput.value = slugify(titleInput.value);
    }
    syncEditorHeading();
    schedulePreview();
  });

  slugInput?.addEventListener("input", () => {
    slugManuallyEdited = true;
    schedulePreview();
  });

  editSlugBtn?.addEventListener("click", () => {
    slugUnlockedForSession = true;
    syncSlugLockState();
    slugInput.focus();
  });

  adminThemeToggle?.addEventListener("click", toggleTheme);
  statusInput?.addEventListener("change", schedulePreview);
  homepageFeaturedInput?.addEventListener("change", syncHomepageOrderState);
  homepageFeaturedInput?.addEventListener("change", schedulePreview);
  logoutButton?.addEventListener("click", async () => {
    try {
      await requestApi("/api/admin/logout", {
        method: "POST",
        body: JSON.stringify({})
      });
    } catch (_error) {
      // Redirect regardless so the user lands back on the login screen.
    }
    window.location.href = "/admin/ideas/";
  });

  loadExistingPostBtn?.addEventListener("click", async () => {
    await loadPost(existingPostSlugInput?.value || "");
  });

  existingPostSlugInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await loadPost(existingPostSlugInput.value);
  });

  recentPostsSelect?.addEventListener("change", async () => {
    if (!recentPostsSelect.value) return;
    await loadPost(recentPostsSelect.value);
  });

  postContent?.addEventListener("keydown", handleEditorEnter);

  previewButton?.addEventListener("click", async () => {
    setMessage(editorMessage, "");
    try {
      await runPreview();
    } catch (error) {
      setMessage(editorMessage, error.message, true);
    }
  });

  editorForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveDraft();
    } catch (error) {
      setMessage(editorMessage, error.message, true);
    }
  });

  publishPostBtn?.addEventListener("click", async () => {
    try {
      await publishPost();
    } catch (error) {
      setMessage(editorMessage, error.message, true);
    }
  });

  editorForm?.addEventListener("input", (event) => {
    updateDraftStateIndicator("Current Draft");
    if (event.target === titleInput || event.target === slugInput) return;
    schedulePreview();
  });

  editorForm?.addEventListener("change", (event) => {
    updateDraftStateIndicator("Current Draft");
    if (event.target === homepageFeaturedInput) return;
    schedulePreview();
  });

  formatButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      applyMarkdownFormat(button.dataset.formatAction);
    });
  });

  loadThemePreference();
  refreshSecurityState().catch(() => {});
  syncEditorHeading();
  syncHomepageOrderState();
  setNewPostMode();
  setEditorAuthenticated(false);
  clearPreview();
})();
