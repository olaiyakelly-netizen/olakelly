if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const frameworkLetterOrder = ["S", "T", "E", "W", "A", "R", "D"];

const frameworkSteps = [
  {
    letter: "S",
    number: 1,
    shortTitle: "Scope",
    title: "Scope the Responsibility",
    description: "Define what the responsibility actually entails before agreeing.",
    activeDescription: "Define what the commitment actually requires before you agree to carry it.",
    angle: -90
  },
  {
    letter: "T",
    number: 2,
    shortTitle: "Trade-Offs",
    title: "Trade-Off Analysis",
    description: "Evaluate what the commitment will displace.",
    activeDescription: "Evaluate what the commitment will displace.",
    angle: -38.5714
  },
  {
    letter: "E",
    number: 3,
    shortTitle: "Energy",
    title: "Energy Audit",
    description: "Assess physical, emotional, and cognitive capacity.",
    activeDescription: "Assess physical, emotional, and cognitive capacity.",
    angle: 12.8571
  },
  {
    letter: "W",
    number: 4,
    shortTitle: "Weight",
    title: "Weighted Priorities",
    description: "Determine whether the commitment moves the mission forward.",
    activeDescription: "Determine whether the commitment moves the mission forward.",
    angle: 64.2857
  },
  {
    letter: "A",
    number: 5,
    shortTitle: "Align",
    title: "Alignment Check",
    description: "Ensure the responsibility aligns with role, season, and long-term trajectory.",
    activeDescription: "Ensure the responsibility aligns with role, season, and long-term trajectory.",
    angle: 115.7143
  },
  {
    letter: "R",
    number: 6,
    shortTitle: "Risk",
    title: "Risk Anticipation",
    description: "Anticipate possible consequences and overextension.",
    activeDescription: "Anticipate possible consequences and overextension.",
    angle: 167.1429
  },
  {
    letter: "D",
    number: 7,
    shortTitle: "Boundaries",
    title: "Deliberate Boundaries",
    description: "Define operational structure, expectations, and limits.",
    activeDescription: "Define operational structure, expectations, and limits.",
    angle: 218.5714
  }
];
const normalizedFrameworkSteps = frameworkLetterOrder
  .map((letter) => frameworkSteps.find((step) => step.letter === letter))
  .filter(Boolean);

let activeFrameworkStep = null;
let hasFrameworkAnimatedIn = false;
let heroRotatorPhrases = [];

const heroRotator = document.getElementById("heroRotator");
const rotatorLines = Array.from(document.querySelectorAll(".rotator-line"));
const frameworkSection = document.getElementById("framework");
const frameworkNodes = document.getElementById("frameworkNodes");
const frameworkDirectionMarkers = document.getElementById("frameworkDirectionMarkers");
const header = document.getElementById("siteHeader");
const appWrapper = document.getElementById("app-wrapper");

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobilePanel = document.getElementById("mobilePanel");
const mobileOverlay = document.getElementById("mobileOverlay");
const mobileCloseBtn = document.getElementById("mobileCloseBtn");

const themeToggle = document.getElementById("themeToggle");
const mobileThemeToggle = document.getElementById("mobileThemeToggle");
const htmlElement = document.documentElement;
const bodyElement = document.body;

const primaryCtaBtn = document.getElementById("primaryCtaBtn");
const latestIdeasGrid = document.getElementById("latestIdeasGrid");

const SIGNUP_ENDPOINT = "/api/signup";
const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function setHeroRotatorMetrics() {
  if (!heroRotator || rotatorLines.length === 0 || heroRotatorPhrases.length === 0) return;

  let maxWidth = 0;
  let maxHeight = 0;

  rotatorLines.forEach((line, index) => {
    const spans = Array.from(line.querySelectorAll("span"));
    const previousPosition = line.style.position;
    const previousVisibility = line.style.visibility;
    const previousOpacity = line.style.opacity;
    const previousPointerEvents = line.style.pointerEvents;
    const previousText = spans.map((span) => span.textContent);

    line.style.position = "relative";
    line.style.visibility = "hidden";
    line.style.opacity = "1";
    line.style.pointerEvents = "none";
    spans.forEach((span, spanIndex) => {
      span.textContent = heroRotatorPhrases[index][spanIndex] ?? "";
    });

    const { width, height } = line.getBoundingClientRect();
    maxWidth = Math.max(maxWidth, width);
    maxHeight = Math.max(maxHeight, height);

    spans.forEach((span, spanIndex) => {
      span.textContent = previousText[spanIndex] ?? "";
    });
    line.style.position = previousPosition;
    line.style.visibility = previousVisibility;
    line.style.opacity = previousOpacity;
    line.style.pointerEvents = previousPointerEvents;
  });

  if (window.innerWidth <= 640) {
    heroRotator.style.width = "100%";
  } else {
    heroRotator.style.width = `${Math.ceil(maxWidth)}px`;
  }

  heroRotator.style.height = `${Math.ceil(maxHeight)}px`;
}

function sleep(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function setRotatorLineText(line, phrase, characterCountByLine) {
  const spans = Array.from(line.querySelectorAll("span"));
  spans.forEach((span, index) => {
    const fullText = phrase[index] ?? "";
    const visibleCharacters = characterCountByLine[index] ?? 0;
    span.textContent = fullText.slice(0, visibleCharacters);
  });
}

async function typeLine(lineElement, lineText, lineIndex, phrase) {
  for (let characterCount = 0; characterCount <= lineText.length; characterCount += 1) {
    const characterCountByLine = phrase.map((_, index) => {
      if (index < lineIndex) return phrase[index].length;
      if (index === lineIndex) return characterCount;
      return 0;
    });

    setRotatorLineText(lineElement, phrase, characterCountByLine);
    await sleep(characterCount === lineText.length ? 120 : 58);
  }
}

async function eraseLine(lineElement, lineText, lineIndex, phrase) {
  for (let characterCount = lineText.length; characterCount >= 0; characterCount -= 1) {
    const characterCountByLine = phrase.map((_, index) => {
      if (index < lineIndex) return phrase[index].length;
      if (index === lineIndex) return characterCount;
      return 0;
    });

    setRotatorLineText(lineElement, phrase, characterCountByLine);
    await sleep(characterCount === 0 ? 110 : 34);
  }
}

function showStaticHeroPhrase() {
  const firstPhrase = heroRotatorPhrases[0];
  const firstLine = rotatorLines[0];
  if (!firstPhrase || !firstLine) return;

  rotatorLines.forEach((line) => {
    line.classList.remove("is-visible");
    setRotatorLineText(line, ["", ""], [0, 0]);
  });

  firstLine.classList.add("is-visible");
  setRotatorLineText(firstLine, firstPhrase, firstPhrase.map((text) => text.length));
}

async function runHeroRotator() {
  if (heroRotatorPhrases.length === 0) return;

  let phraseIndex = 0;

  while (true) {
    const lineElement = rotatorLines[phraseIndex];
    const phrase = heroRotatorPhrases[phraseIndex];
    if (!lineElement || !phrase) return;

    rotatorLines.forEach((line) => {
      line.classList.remove("is-visible");
      setRotatorLineText(line, ["", ""], [0, 0]);
    });

    lineElement.classList.add("is-visible");

    await typeLine(lineElement, phrase[0], 0, phrase);
    await typeLine(lineElement, phrase[1], 1, phrase);
    await sleep(1250);
    await eraseLine(lineElement, phrase[1], 1, phrase);
    await eraseLine(lineElement, phrase[0], 0, phrase);
    lineElement.classList.remove("is-visible");

    phraseIndex = (phraseIndex + 1) % heroRotatorPhrases.length;
    await sleep(220);
  }
}

function initHeroRotator() {
  if (!heroRotator || rotatorLines.length === 0) return;

  heroRotatorPhrases = rotatorLines.map((line) =>
    Array.from(line.querySelectorAll("span")).map((span) => span.textContent.trim())
  );

  setHeroRotatorMetrics();
  rotatorLines.forEach((line) => {
    line.classList.remove("active", "is-visible");
    setRotatorLineText(line, ["", ""], [0, 0]);
  });

  if (prefersReducedMotion || rotatorLines.length === 1) {
    showStaticHeroPhrase();
    return;
  }

  void runHeroRotator();
}

function getFrameworkPosition(step) {
  const radians = (step.angle * Math.PI) / 180;
  const radius = 312;
  const center = 450;

  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians)
  };
}

function renderDirectionMarkers() {
  if (!frameworkDirectionMarkers) return;

  frameworkDirectionMarkers.innerHTML = "";
  const markers = [
    { x: 585.372, y: 168.898, angle: 25.7143 },
    { x: 754.177, y: 380.573, angle: 77.1429 },
    { x: 693.932, y: 644.529, angle: 128.5714 },
    { x: 206.068, y: 644.529, angle: 231.4286 },
    { x: 145.823, y: 380.573, angle: 282.8571 },
    { x: 314.628, y: 168.898, angle: 334.2857 }
  ];

  markers.forEach(({ x, y, angle }) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    path.setAttribute("d", "M -8 -4 L 0 0 L -8 4 z");
    path.setAttribute("class", "framework-direction-marker");
    path.setAttribute("transform", `rotate(${angle}) translate(${x} ${y})`);
    frameworkDirectionMarkers.appendChild(path);
  });
}

function createFrameworkNode(step) {
  const button = document.createElement("button");
  const badge = document.createElement("span");
  const letter = document.createElement("span");
  const label = document.createElement("span");
  const tooltip = document.createElement("span");
  const tooltipMeta = document.createElement("span");
  const tooltipTitle = document.createElement("span");
  const tooltipDescription = document.createElement("span");
  const position = getFrameworkPosition(step);

  button.type = "button";
  button.className = "framework-node";
  button.setAttribute("data-framework-step", String(step.number));
  button.setAttribute("aria-label", `Step ${step.number}: ${step.title}`);
  button.style.left = `${(position.x / 900) * 100}%`;
  button.style.top = `${(position.y / 900) * 100}%`;

  badge.className = "framework-node-badge";
  badge.textContent = String(step.number);

  letter.className = "framework-node-letter";
  letter.textContent = step.letter;

  label.className = "framework-node-label";
  label.textContent = step.shortTitle;

  tooltip.className = "framework-node-tooltip";
  tooltipMeta.className = "framework-node-tooltip-meta";
  tooltipMeta.textContent = `${step.letter} / Step ${step.number}`;
  tooltipTitle.className = "framework-node-tooltip-title";
  tooltipTitle.textContent = step.title;
  tooltipDescription.className = "framework-node-tooltip-description";
  tooltipDescription.textContent = step.description;

  const tooltipPlacementMap = {
    S: ["outside-top", "align-center"],
    T: ["outside-top-right", "align-left"],
    E: ["outside-right", "align-left"],
    W: ["outside-bottom-right", "align-left"],
    A: ["outside-bottom-left", "align-right"],
    R: ["outside-left", "align-right"],
    D: ["outside-top-left", "align-right"]
  };
  const placementClasses = tooltipPlacementMap[step.letter] || ["outside-top", "align-center"];
  tooltip.classList.add(...placementClasses);

  tooltip.append(tooltipMeta, tooltipTitle, tooltipDescription);
  button.append(badge, letter, label, tooltip);

  button.addEventListener("click", () => setActiveFrameworkStep(step.number));
  button.addEventListener("mouseenter", () => setActiveFrameworkStep(step.number));
  button.addEventListener("focus", () => setActiveFrameworkStep(step.number));
  button.addEventListener("keydown", (event) => handleFrameworkKeydown(event, step.number));

  return button;
}

function focusFrameworkStep(stepNumber) {
  const target = document.querySelector(`.framework-node[data-framework-step="${stepNumber}"]`);

  if (target instanceof HTMLElement) {
    target.focus();
  }
}

function handleFrameworkKeydown(event, currentStepNumber) {
  const currentIndex = normalizedFrameworkSteps.findIndex((step) => step.number === currentStepNumber);
  if (currentIndex === -1) return;

  let nextIndex = currentIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % normalizedFrameworkSteps.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + normalizedFrameworkSteps.length) % normalizedFrameworkSteps.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = normalizedFrameworkSteps.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextStep = normalizedFrameworkSteps[nextIndex];
  setActiveFrameworkStep(nextStep.number);
  focusFrameworkStep(nextStep.number);
}

function clearActiveFrameworkStep() {
  activeFrameworkStep = null;

  document.querySelectorAll("[data-framework-step]").forEach((element) => {
    element.classList.remove("is-active");

    if (element.tagName === "BUTTON") {
      element.setAttribute("aria-pressed", "false");
    }
  });
}

function setActiveFrameworkStep(stepNumber) {
  const step = normalizedFrameworkSteps.find((item) => item.number === stepNumber);
  if (!step) return;

  activeFrameworkStep = stepNumber;

  document.querySelectorAll("[data-framework-step]").forEach((element) => {
    const isActive = Number(element.getAttribute("data-framework-step")) === stepNumber;
    element.classList.toggle("is-active", isActive);

    if (element.tagName === "BUTTON") {
      element.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  });
}

function initFrameworkExperience() {
  if (!frameworkNodes) return;

  renderDirectionMarkers();
  frameworkNodes.replaceChildren(...normalizedFrameworkSteps.map((step) => createFrameworkNode(step)));

  frameworkNodes.addEventListener("mouseleave", clearActiveFrameworkStep);
  frameworkSection?.addEventListener("mouseleave", clearActiveFrameworkStep);

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Node)) return;
    if (frameworkSection?.contains(event.target)) return;
    clearActiveFrameworkStep();
  });

  document.addEventListener("focusin", (event) => {
    if (!(event.target instanceof Node)) return;
    if (frameworkSection?.contains(event.target)) return;
    clearActiveFrameworkStep();
  });
}

function activateFrameworkAnimation() {
  if (!frameworkSection || hasFrameworkAnimatedIn) return;

  frameworkSection.classList.add("framework-visible");
  hasFrameworkAnimatedIn = true;
}

function initFrameworkObserver() {
  if (!frameworkSection) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    activateFrameworkAnimation();
    return;
  }

  const scrollRoot = appWrapper instanceof HTMLElement ? appWrapper : null;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        activateFrameworkAnimation();
        observer.unobserve(entry.target);
      });
    },
    {
      root: scrollRoot,
      threshold: 0.2
    }
  );

  observer.observe(frameworkSection);
}

function initTimelineReveal() {
  const revealCards = Array.from(document.querySelectorAll(".reveal-card"));
  if (revealCards.length === 0) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealCards.forEach((card) => card.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -40px 0px"
    }
  );

  revealCards.forEach((card, index) => {
    if (card instanceof HTMLElement) {
      card.style.transitionDelay = `${index * 90}ms`;
    }
    observer.observe(card);
  });
}

function openMobileMenu() {
  mobilePanel?.classList.add("open");
  mobileOverlay?.classList.add("open");
}

function closeMobileMenu() {
  mobilePanel?.classList.remove("open");
  mobileOverlay?.classList.remove("open");
}

function toggleTheme() {
  const isDarkMode = htmlElement.classList.contains("dark-mode");

  if (isDarkMode) {
    htmlElement.classList.remove("dark-mode");
    bodyElement.classList.remove("dark-mode");
    themeToggle?.classList.remove("dark");
    mobileThemeToggle?.classList.remove("dark");
    localStorage.setItem("darkMode", "false");
    return;
  }

  htmlElement.classList.add("dark-mode");
  bodyElement.classList.add("dark-mode");
  themeToggle?.classList.add("dark");
  mobileThemeToggle?.classList.add("dark");
  localStorage.setItem("darkMode", "true");
}

function renderSignupStatus(statusElement, message, tone) {
  if (!statusElement) return;

  statusElement.classList.remove("success-message", "error-message");
  statusElement.classList.add("message-box", tone === "success" ? "success-message" : "error-message");
  statusElement.style.display = "block";
  statusElement.innerHTML = `<p class="font-body">${message}</p>`;
}

function replaceSignupFormWithSuccess(form) {
  form.innerHTML = `
    <div class="message-box success-message" data-signup-status aria-live="polite">
      <p class="font-body">You&rsquo;re in. Thoughtful notes will arrive when they&rsquo;re worth sending.</p>
    </div>
  `;
}

async function handleSignupSubmit(form) {
  if (form.dataset.signupSubmitting === "true") return;

  const emailField = form.querySelector('input[name="email"]');
  const sourceField = form.querySelector('input[name="source"]');
  const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
  const statusElement = form.querySelector("[data-signup-status]");
  const email = emailField?.value.trim() || "";
  const source = sourceField?.value.trim() || "unknown";

  form.dataset.signupSubmitting = "true";

  if (submitButton) {
    submitButton.disabled = true;
  }

  if (statusElement) {
    statusElement.style.display = "none";
    statusElement.textContent = "";
  }

  try {
    const security = await fetch("/api/admin/security", { credentials: "same-origin" }).then((response) => response.json());
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": security.csrf || ""
      },
      body: JSON.stringify({ email, source })
    });

    if (response.status === 200) {
      replaceSignupFormWithSuccess(form);
      delete form.dataset.signupSubmitting;
      return;
    }

    renderSignupStatus(statusElement, "Please try again.", "error");
  } catch (error) {
    renderSignupStatus(statusElement, "Please try again.", "error");
  } finally {
    if (form.querySelector("[data-signup-status]") === statusElement) {
      if (submitButton) {
        submitButton.disabled = false;
      }

      delete form.dataset.signupSubmitting;
    }
  }
}

function initSignupForms() {
  const signupForms = document.querySelectorAll("[data-signup-form]");

  if (signupForms.length === 0) return;

  signupForms.forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSignupSubmit(form);
    });
  });
}

function initScrollEffects() {
  const scrollContainer = appWrapper || window;

  scrollContainer.addEventListener("scroll", () => {
    const scrollTop = appWrapper ? appWrapper.scrollTop : window.scrollY;

    if (!header) return;

    if (scrollTop > 10) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  });
}

function initEventListeners() {
  mobileMenuBtn?.addEventListener("click", openMobileMenu);
  mobileCloseBtn?.addEventListener("click", closeMobileMenu);
  mobileOverlay?.addEventListener("click", closeMobileMenu);

  themeToggle?.addEventListener("click", toggleTheme);
  mobileThemeToggle?.addEventListener("click", toggleTheme);
  initSignupForms();

  primaryCtaBtn?.addEventListener("click", () => {
    document.getElementById("framework")?.scrollIntoView({ behavior: "smooth" });
  });

  document.querySelectorAll("#mobilePanel a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  window.addEventListener("resize", setHeroRotatorMetrics);
}

function loadThemePreference() {
  if (localStorage.getItem("darkMode") === "false") {
    htmlElement.classList.remove("dark-mode");
    bodyElement.classList.remove("dark-mode");
    themeToggle?.classList.remove("dark");
    mobileThemeToggle?.classList.remove("dark");
    return;
  }

  htmlElement.classList.add("dark-mode");
  bodyElement.classList.add("dark-mode");
  themeToggle?.classList.add("dark");
  mobileThemeToggle?.classList.add("dark");
}

function renderLatestIdeas(posts) {
  if (!latestIdeasGrid) return;

  latestIdeasGrid.innerHTML = posts
    .map((post, index) => `
      <article class="article-card ideas-rise flex flex-col" style="animation-delay: ${0.08 + index * 0.1}s;">
        <p class="ideas-card-category">${post.category}</p>
        <h3 class="font-heading article-title">${post.title}</h3>
        <p class="font-body body-copy article-excerpt">${post.excerpt}</p>
        <div class="ideas-card-footer">
          <a href="${post.url}" class="read-more-link cta-link">Read More</a>
        </div>
      </article>
    `)
    .join("");
}

async function initLatestIdeas() {
  if (!latestIdeasGrid) return;

  try {
    const response = await fetch("data/latest-posts.json", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    const posts = Array.isArray(data.posts) ? data.posts.slice(0, 3) : [];
    if (posts.length === 0) return;
    renderLatestIdeas(posts);
  } catch (_error) {
    // Keep the loading card if the data file is unavailable.
  }
}

function init() {
  loadThemePreference();
  initHeroRotator();
  initFrameworkExperience();
  initFrameworkObserver();
  initTimelineReveal();
  initScrollEffects();
  initEventListeners();
  void initLatestIdeas();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
