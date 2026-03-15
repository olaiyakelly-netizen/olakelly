if (window.lucide?.createIcons) {
  window.lucide.createIcons();
}

const words = ["decisions", "influence", "energy", "responsibility", "commitments"];
let currentWordIndex = 0;

const animatedWord = document.getElementById("animatedWord");
const animatedWordSlot = document.getElementById("animatedWordSlot");
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

const newsletterForm = document.getElementById("newsletterForm");
const emailInput = document.getElementById("emailInput");
const successMessage = document.getElementById("successMessage");
const errorMessage = document.getElementById("errorMessage");
const errorText = document.getElementById("errorText");
const newsletterBtn = document.getElementById("newsletterBtn");

const primaryCtaBtn = document.getElementById("primaryCtaBtn");
const secondaryCtaBtn = document.getElementById("secondaryCtaBtn");

let isSubmitting = false;

/*
  Replace this with your real form endpoint later.
  Example:
  const newsletterEndpoint = "https://your-api-endpoint.com/subscribe";
*/
const newsletterEndpoint = "";

function setAnimatedWordMetrics() {
  if (!animatedWord || !animatedWordSlot) return;

  const measure = document.createElement("span");
  let maxWidth = 0;
  let maxHeight = 0;

  measure.style.position = "absolute";
  measure.style.visibility = "hidden";
  measure.style.pointerEvents = "none";
  measure.style.whiteSpace = "nowrap";
  measure.className = animatedWord.className;

  document.body.appendChild(measure);

  words.forEach((word) => {
    measure.textContent = word;
    const { width, height } = measure.getBoundingClientRect();
    maxWidth = Math.max(maxWidth, width);
    maxHeight = Math.max(maxHeight, height);
  });

  document.body.removeChild(measure);

  const computedCursorStyles = window.getComputedStyle(document.getElementById("typingCursor"));
  const cursorWidth = parseFloat(computedCursorStyles.width) || 0;
  const cursorMarginLeft = parseFloat(computedCursorStyles.marginLeft) || 0;

  animatedWordSlot.style.width = `${Math.ceil(maxWidth + cursorWidth + cursorMarginLeft + 6)}px`;
  animatedWordSlot.style.height = `${Math.ceil(maxHeight)}px`;
}

function typeWord() {
  if (!animatedWord) return;

  const word = words[currentWordIndex];
  let charIndex = 0;
  animatedWord.textContent = "";

  function typeChar() {
    if (charIndex < word.length) {
      animatedWord.textContent += word[charIndex];
      charIndex += 1;
      setTimeout(typeChar, 100);
    } else {
      // Pause after full word is typed
      setTimeout(eraseWord, 2000);
    }
  }

  function eraseWord() {
    if (animatedWord.textContent.length > 0) {
      animatedWord.textContent = animatedWord.textContent.slice(0, -1);
      setTimeout(eraseWord, 50);
    } else {
      currentWordIndex = (currentWordIndex + 1) % words.length;
      setTimeout(typeWord, 500);
    }
  }

  typeChar();
}

function openMobileMenu() {
  if(mobilePanel) mobilePanel.classList.add("open");
  if(mobileOverlay) mobileOverlay.classList.add("open");
}

function closeMobileMenu() {
  if(mobilePanel) mobilePanel.classList.remove("open");
  if(mobileOverlay) mobileOverlay.classList.remove("open");
}

function toggleTheme() {
  const isDarkMode = htmlElement.classList.contains("dark-mode");

  if (isDarkMode) {
    htmlElement.classList.remove("dark-mode");
    bodyElement.classList.remove("dark-mode");
    themeToggle?.classList.remove("dark");
    mobileThemeToggle?.classList.remove("dark");
    localStorage.setItem("darkMode", "false");
  } else {
    htmlElement.classList.add("dark-mode");
    bodyElement.classList.add("dark-mode");
    themeToggle?.classList.add("dark");
    mobileThemeToggle?.classList.add("dark");
    localStorage.setItem("darkMode", "true");
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showSuccess() {
  if(successMessage) successMessage.style.display = "block";
  if(errorMessage) errorMessage.style.display = "none";

  setTimeout(() => {
    if(successMessage) successMessage.style.display = "none";
  }, 5000);
}

function showError(message) {
  if(errorText) errorText.textContent = message;
  if(errorMessage) errorMessage.style.display = "block";
  if(successMessage) successMessage.style.display = "none";
}

async function submitNewsletter(email) {
  if (isSubmitting) return;

  if (!newsletterEndpoint) {
    showError("Newsletter endpoint is not configured yet.");
    return;
  }

  if (!isValidEmail(email)) {
    showError("Please enter a valid email.");
    return;
  }

  isSubmitting = true;
  if(newsletterBtn) {
    newsletterBtn.disabled = true;
    newsletterBtn.textContent = "Subscribing…";
  }
  if(successMessage) successMessage.style.display = "none";
  if(errorMessage) errorMessage.style.display = "none";

  try {
    const response = await fetch(newsletterEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (response.ok) {
      showSuccess();
      if(emailInput) emailInput.value = "";
    } else {
      const errorData = await response.json().catch(() => ({}));
      showError(errorData.message || "Subscription failed. Please try again.");
    }
  } catch (error) {
    showError("Unable to connect. Please check your endpoint and try again.");
  } finally {
    if(newsletterBtn) {
      newsletterBtn.disabled = false;
      newsletterBtn.textContent = "Subscribe";
    }
    isSubmitting = false;
  }
}

function initScrollEffects() {
  // Use window scroll if appWrapper isn't the primary scrolling container
  const scrollContainer = appWrapper || window;
  
  scrollContainer.addEventListener("scroll", () => {
    const scrollTop = appWrapper ? appWrapper.scrollTop : window.scrollY;
    if (header) {
      if (scrollTop > 10) {
        header.classList.add("scrolled");
      } else {
        header.classList.remove("scrolled");
      }
    }
  });
}

function initEventListeners() {
  if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openMobileMenu);
  if (mobileCloseBtn) mobileCloseBtn.addEventListener("click", closeMobileMenu);
  if (mobileOverlay) mobileOverlay.addEventListener("click", closeMobileMenu);

  if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
  if (mobileThemeToggle) mobileThemeToggle.addEventListener("click", toggleTheme);

  if (newsletterForm) {
    newsletterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if(emailInput) submitNewsletter(emailInput.value.trim());
    });
  }

  if (primaryCtaBtn) {
    primaryCtaBtn.addEventListener("click", () => {
      document.getElementById("ideas")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  if (secondaryCtaBtn) {
    secondaryCtaBtn.addEventListener("click", () => {
      document.getElementById("framework")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  document.querySelectorAll("#mobilePanel a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });
}

function loadThemePreference() {
  if (localStorage.getItem("darkMode") === "true") {
    htmlElement.classList.add("dark-mode");
    bodyElement.classList.add("dark-mode");
    themeToggle?.classList.add("dark");
    mobileThemeToggle?.classList.add("dark");
  }
}

function init() {
  setAnimatedWordMetrics();
  loadThemePreference();
  initScrollEffects();
  initEventListeners();
  // Small delay to ensure styles are parsed
  setTimeout(typeWord, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
