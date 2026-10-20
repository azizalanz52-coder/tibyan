(function () {
  const engine = window.MakanakEngine;
  const WELCOME_LINE = "أهلاً بك في تبيان. مكانك هنا حيث يتحدث الجميع لغتك";
  const STEPS = [
    { pose: "hello", caption: "أهلاً بك", gloss: 0, t: 1500 },
    { pose: "place", caption: "في تبيان", gloss: 1, t: 1500 },
    { pose: "all", caption: "حيث يتحدث الجميع", gloss: 2, t: 1700 },
    { pose: "you", caption: "لغتك", gloss: 3, t: 1500 }
  ];
  const POSES = ["idle", "hello", "place", "all", "you", "explain"];
  const HEARING_LABEL = { hearing: "أسمع", hoh: "ضعيف سمع", deaf: "أصم" };
  const state = { profile: null, seq: 0, voiceTimer: 0, lastSpeak: "" };
  const VIDEO_KEY = "tibyan.videos.v1";

  function readSavedVideos() {
    try {
      const saved = JSON.parse(localStorage.getItem(VIDEO_KEY) || "null");
      if (saved && typeof saved === "object") return saved;
    } catch (err) { /* تجاهل */ }
    return null;
  }

  function videoFor(topic) {
    const saved = readSavedVideos();
    if (saved && Object.prototype.hasOwnProperty.call(saved, topic)) return saved[topic] || "";
    const published = window.TIBYAN_VIDEOS || {};
    return published[topic] || "";
  }

  function youtubeId(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
    try {
      const url = new URL(text);
      const host = url.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = url.pathname.split("/").filter(Boolean)[0] || "";
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
      }
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
        const fromQuery = url.searchParams.get("v") || "";
        if (/^[A-Za-z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
        const parts = url.pathname.split("/").filter(Boolean);
        if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") && /^[A-Za-z0-9_-]{11}$/.test(parts[1] || "")) {
          return parts[1];
        }
      }
    } catch (err) { /* ليس رابطًا */ }
    return "";
  }

  function paintLessons() {
    document.querySelectorAll(".lesson").forEach(function (button) {
      const id = youtubeId(videoFor(button.dataset.topic));
      const art = button.querySelector(".lesson-art");
      const note = button.querySelector("em");
      if (!art || !note) return;
      if (id) {
        art.classList.add("has-clip");
        art.style.backgroundImage = "url(https://i.ytimg.com/vi/" + id + "/hqdefault.jpg)";
        note.textContent = "مقطع يوتيوب + ترجمة نصية";
      } else {
        art.classList.remove("has-clip");
        art.style.backgroundImage = "";
        note.textContent = "أضف رابط يوتيوب لهذا الدرس";
      }
    });
  }

  function fillClipInputs() {
    document.querySelectorAll("[data-clip]").forEach(function (input) {
      input.value = videoFor(input.dataset.clip);
    });
  }

  function clearLessonVideo() {
    const box = document.getElementById("lesson-video");
    if (!box) return;
    box.hidden = true;
    box.replaceChildren();
  }

  function mountLessonVideo(topic, title) {
    const box = document.getElementById("lesson-video");
    const id = youtubeId(videoFor(topic));
    if (!box) return;
    box.replaceChildren();
    if (!id) {
      box.hidden = true;
      return;
    }
    const frame = document.createElement("iframe");
    frame.src = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0&modestbranding=1&cc_load_policy=1&hl=ar";
    frame.title = title || "مقطع الدرس";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.loading = "lazy";
    box.appendChild(frame);
    box.hidden = false;
  }

  const home = document.getElementById("home");
  const screenApp = document.getElementById("screen-app");
  const formError = document.getElementById("form-error");
  const gloss = document.getElementById("gloss");

  function cloneCharacters() {
    const tpl = document.getElementById("tpl-character");
    document.querySelectorAll(".stage-slot").forEach(function (slot) {
      slot.replaceChildren(tpl.content.cloneNode(true));
    });
  }

  function setPose(pose) {
    document.querySelectorAll(".avatar").forEach(function (svg) {
      POSES.forEach(function (name) { svg.classList.remove("pose-" + name); });
      svg.classList.add("pose-" + pose);
    });
  }

  function setSpeaking(on) {
    document.querySelectorAll(".avatar").forEach(function (svg) {
      svg.classList.toggle("speaking", on);
    });
    document.querySelectorAll(".stage").forEach(function (stage) {
      stage.classList.toggle("is-speaking", on);
    });
  }

  function hearingNow() {
    if (!home.hidden && state.profile && screenApp.hidden) {
      return selected("hearing") || "";
    }
    if (!screenApp.hidden && state.profile) return state.profile.hearing;
    return selected("hearing") || "";
  }

  function soundAllowed() {
    const hearing = hearingNow();
    return hearing !== "deaf" && hearing !== "hoh";
  }

  function pickVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices();
    return voices.find(function (voice) { return /ar-SA/i.test(voice.lang); })
      || voices.find(function (voice) { return /^ar/i.test(voice.lang); })
      || null;
  }

  function speak(text) {
    if (!soundAllowed() || !window.speechSynthesis || !text) return;
    window.clearTimeout(state.voiceTimer);
    state.lastSpeak = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-SA";
    utterance.rate = 0.95;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = function () { setSpeaking(false); };
    utterance.onerror = function () { setSpeaking(false); };
    speechSynthesis.cancel();
    setSpeaking(true);
    state.voiceTimer = window.setTimeout(function () {
      if (speechSynthesis.paused) speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    }, 80);
  }

  function stopVoice() {
    window.clearTimeout(state.voiceTimer);
    if (window.speechSynthesis) speechSynthesis.cancel();
    setSpeaking(false);
  }

  function setCaptions(text) {
    ["welcome-caption", "big-caption", "app-caption", "lesson-caption"].forEach(function (id) {
      const node = document.getElementById(id);
      if (node && text) node.textContent = text;
    });
  }

  function highlightGloss(index) {
    gloss.querySelectorAll("li").forEach(function (item) {
      item.classList.toggle("is-on", Number(item.dataset.i) === index);
    });
  }

  function playWelcome(withVoice) {
    const token = ++state.seq;
    if (withVoice) speak(WELCOME_LINE);
    let i = 0;
    function run() {
      if (token !== state.seq) return;
      if (i >= STEPS.length) {
        setPose("idle");
        setCaptions(WELCOME_LINE);
        highlightGloss(-1);
        return;
      }
      const step = STEPS[i];
      setPose(step.pose);
      setCaptions(step.caption);
      highlightGloss(step.gloss);
      i += 1;
      window.setTimeout(run, step.t);
    }
    run();
  }

  function selected(group) {
    return document.querySelector('[data-group="' + group + '"].is-on') || null;
  }

  function readForm() {
    const age = selected("age");
    const gender = selected("gender");
    const hearing = selected("hearing");
    return {
      ageFrom: age ? age.dataset.from : "",
      ageTo: age ? age.dataset.to : "",
      ageLabel: age ? age.dataset.label : "",
      gender: gender ? gender.dataset.value : "",
      hearing: hearing ? hearing.dataset.value : ""
    };
  }

  function markSteps(raw) {
    const done = [Boolean(raw.ageFrom), Boolean(raw.gender), Boolean(raw.hearing)];
    const current = done.findIndex(function (item) { return !item; });
    document.querySelectorAll(".steps-top li").forEach(function (item) {
      const step = Number(item.dataset.step);
      item.classList.toggle("is-done", step < 4 && done[step - 1]);
      item.classList.toggle("is-on", current === -1 ? step === 4 : step === current + 1);
    });
  }

  function updateSummary() {
    const raw = readForm();
    markSteps(raw);
    const pills = document.getElementById("summary-pills");
    pills.replaceChildren();
    const bits = [];
    if (raw.ageLabel) bits.push(raw.ageLabel);
    if (raw.gender) bits.push(raw.gender === "female" ? "أنثى" : "ذكر");
    if (raw.hearing) bits.push(HEARING_LABEL[raw.hearing]);
    if (!bits.length) {
      const empty = document.createElement("span");
      empty.className = "pill mute";
      empty.textContent = "لم يختر بعد";
      pills.appendChild(empty);
    } else {
      bits.forEach(function (bit) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = bit;
        pills.appendChild(pill);
      });
    }
    const hello = document.getElementById("hello-line");
    if (raw.ageFrom && raw.gender && raw.hearing) {
      const who = engine.persona({
        ageFrom: Number(raw.ageFrom),
        ageTo: Number(raw.ageTo),
        gender: raw.gender,
        hearing: raw.hearing
      });
      hello.textContent = "أهلاً بك في تبيان. تم تجهيز المحتوى المناسب لك مع " + who.name + "، " + who.role + ".";
    } else {
      hello.textContent = "أهلاً بك في تبيان. كمّل اختياراتك حتى نجهّز المحتوى المناسب لك.";
    }
    document.body.dataset.hearing = raw.hearing || "";
    if (!soundAllowed()) stopVoice();
    formError.textContent = "";
  }

  function validate(raw) {
    if (!raw.ageFrom) return "اختر الفئة العمرية.";
    if (!raw.gender) return "اختر الجنس.";
    if (!raw.hearing) return "اختر حالة السمع.";
    return "";
  }

  function showHome() {
    home.hidden = false;
    screenApp.hidden = true;
    document.body.dataset.theme = "home";
    clearLessonVideo();
    window.scrollTo(0, 0);
  }

  function showApp() {
    home.hidden = true;
    screenApp.hidden = false;
    document.body.dataset.theme = engine.getMode(state.profile);
    document.body.dataset.hearing = state.profile.hearing;
    window.scrollTo(0, 0);
  }

  function enterApp(profile) {
    state.profile = {
      ageFrom: Number(profile.ageFrom),
      ageTo: Number(profile.ageTo),
      gender: profile.gender,
      hearing: profile.hearing
    };
    try { localStorage.setItem("tibyan.profile.v1", JSON.stringify(state.profile)); } catch (err) { /* العرض يكمل */ }
    clearLessonVideo();
    renderApp();
    showApp();
  }

  function renderApp() {
    const profile = state.profile;
    const who = engine.persona(profile);
    const mode = engine.getMode(profile);
    document.getElementById("app-stage").dataset.variant = who.variant;
    document.getElementById("who-name").textContent = who.name;
    document.getElementById("who-role").textContent = who.role;
    const hearing = HEARING_LABEL[profile.hearing];
    const gender = profile.gender === "female" ? "أنثى" : "ذكر";
    document.getElementById("path-pill").textContent = profile.ageFrom + "–" + profile.ageTo + " · " + gender + " · " + hearing;
    document.getElementById("convo-title").textContent = mode === "child" || mode === "deaf-child" ? "احكِ لي وش صار" : "محتواك في تبيان";
    document.getElementById("convo-sub").textContent = mode === "assistant"
      ? "المحرك يبسّط الفكرة المقلقة، ثم يعطيك خطوات حماية."
      : "كلام قصير، والنص ظاهر بحجم كبير.";
    document.getElementById("ask-input").placeholder = mode === "child" || mode === "deaf-child" ? "احكِ لي وش صار..." : "اكتب الموقف أو السؤال";
    document.getElementById("ask-send").textContent = mode === "child" || mode === "deaf-child" ? "قول لي" : "أرسل";
    document.getElementById("app-help").textContent = mode === "child" || mode === "deaf-child"
      ? "إذا خفت الحين: قول لأمك أو أبوك أو معلمك. للطوارئ 911. وللمساعدة 1919."
      : "إذا كنت في خطر الآن: 911 للطوارئ، و1919 لبلاغات العنف الأسري.";
    const chips = document.getElementById("chips");
    chips.replaceChildren();
    engine.chipsFor(profile).forEach(function (chip) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = chip.label;
      button.addEventListener("click", function () { submitText(chip.label); });
      chips.appendChild(button);
    });
    const thread = document.getElementById("thread");
    thread.replaceChildren();
    const intro = document.createElement("div");
    intro.className = "msg-bot";
    const line = document.createElement("p");
    line.className = "intro-line";
    line.textContent = engine.introFor(profile);
    intro.appendChild(line);
    thread.appendChild(intro);
    setCaptions(engine.introFor(profile));
    setPose("hello");
    window.setTimeout(function () { setPose("idle"); }, 1400);
    if (soundAllowed()) speak(engine.introFor(profile));
  }

  function renderAnswer(card, profile) {
    const article = document.createElement("article");
    article.className = "answer";
    const kicker = document.createElement("span");
    kicker.className = "kicker";
    kicker.textContent = card.kicker;
    const title = document.createElement("h2");
    title.textContent = card.title;
    const lead = document.createElement("p");
    lead.className = "lead";
    lead.textContent = card.lead;
    article.append(kicker, title, lead);
    if (card.deep && card.echo) {
      const grid = document.createElement("div");
      grid.className = "transform";
      [["الكلام المقلق", card.echo], ["المعنى المبسّط", card.lead], ["وش تسوي", card.steps[0] || card.safe]].forEach(function (pair) {
        const box = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = pair[0];
        const text = document.createElement("p");
        text.textContent = pair[1];
        box.append(label, text);
        grid.appendChild(box);
      });
      article.appendChild(grid);
    }
    if (card.danger) {
      const danger = document.createElement("p");
      danger.className = "danger";
      danger.textContent = card.danger;
      article.appendChild(danger);
    }
    const steps = document.createElement("ol");
    steps.className = "steps";
    card.steps.forEach(function (step, index) {
      const item = document.createElement("li");
      const num = document.createElement("b");
      num.textContent = String(index + 1);
      const text = document.createElement("span");
      text.textContent = step;
      item.append(num, text);
      steps.appendChild(item);
    });
    article.appendChild(steps);
    const safe = document.createElement("p");
    safe.className = "safe";
    safe.textContent = card.safe;
    article.appendChild(safe);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const simpler = document.createElement("button");
    simpler.type = "button";
    simpler.className = "btn btn-ghost btn-sm";
    simpler.textContent = card.simple ? "ارجع للشرح" : "أبسطها أكثر";
    simpler.addEventListener("click", function () {
      const next = engine.buildCard(card.id, profile, !card.simple);
      article.replaceWith(renderAnswer(next, profile));
      showOnCharacter(next, false);
    });
    actions.appendChild(simpler);
    if (profile.hearing === "deaf" || profile.hearing === "hoh") {
      const replay = document.createElement("button");
      replay.type = "button";
      replay.className = "btn btn-ghost btn-sm";
      replay.textContent = "أعد الحركة";
      replay.addEventListener("click", function () { showOnCharacter(card, false); });
      actions.appendChild(replay);
    } else {
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "btn btn-ghost btn-sm";
      listen.textContent = "اقرأها بصوت";
      listen.addEventListener("click", function () { showOnCharacter(card, true); });
      actions.appendChild(listen);
    }
    article.appendChild(actions);
    return article;
  }

  function showOnCharacter(card, withVoice) {
    setCaptions(card.lead);
    setPose("explain");
    if (withVoice) speak(card.speak);
    else stopVoice();
  }

  function engineBlock() {
    const wrap = document.createElement("div");
    wrap.className = "engine";
    const title = document.createElement("p");
    title.className = "engine-title";
    title.textContent = "محرك التبسيط الوقائي";
    const list = document.createElement("ol");
    ["نرصد الخطر أو الضغط الفكري", "نبسّط المعنى بكلام واضح", "نحوّله إلى خطوات وقاية"].forEach(function (label, index) {
      const item = document.createElement("li");
      const mark = document.createElement("b");
      mark.textContent = String(index + 1);
      const text = document.createElement("span");
      text.textContent = label;
      item.append(mark, text);
      list.appendChild(item);
    });
    wrap.append(title, list);
    return wrap;
  }

  function pushAnswer(clean, topicId, typed) {
    const thread = document.getElementById("thread");
    const user = document.createElement("div");
    user.className = "msg-user";
    user.textContent = clean.slice(0, 400);
    thread.appendChild(user);
    const host = document.createElement("div");
    host.className = "msg-bot";
    thread.appendChild(host);
    const resultType = typed ? engine.classify(clean).type : "topic";
    if (resultType === "greeting") {
      const card = engine.buildCard("greeting", state.profile, false);
      host.appendChild(renderAnswer(card, state.profile));
      showOnCharacter(card, true);
      thread.scrollTop = thread.scrollHeight;
      return;
    }
    const motor = engineBlock();
    host.appendChild(motor);
    thread.scrollTop = thread.scrollHeight;
    motor.querySelectorAll("li").forEach(function (item, index) {
      window.setTimeout(function () { item.classList.add("is-on"); }, 280 * index);
    });
    window.setTimeout(function () {
      const id = topicId || engine.classify(clean).id || engine.classify(clean).type;
      const card = engine.buildCard(id, state.profile, false);
      host.appendChild(renderAnswer(card, state.profile));
      showOnCharacter(card, true);
      thread.scrollTop = thread.scrollHeight;
    }, 1000);
  }

  function submitText(text) {
    const clean = text.trim();
    if (!clean || !state.profile) return;
    pushAnswer(clean, null, true);
    const input = document.getElementById("ask-input");
    if (input) input.value = "";
  }

  function openLesson(button) {
    const raw = state.profile || readForm();
    const error = state.profile ? "" : validate(raw);
    if (error) {
      formError.textContent = error + " بعدها تقدر تدخل الدرس.";
      document.getElementById("journey").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    enterApp(raw);
    mountLessonVideo(button.dataset.topic, button.dataset.title);
    window.setTimeout(function () {
      pushAnswer(button.dataset.title, button.dataset.topic, false);
    }, 350);
  }

  document.querySelectorAll(".pick").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll('[data-group="' + button.dataset.group + '"]').forEach(function (item) {
        item.classList.remove("is-on");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("is-on");
      button.setAttribute("aria-pressed", "true");
      state.profile = null;
      updateSummary();
    });
  });

  document.getElementById("btn-prev").addEventListener("click", function () {
    ["hearing", "gender", "age"].some(function (group) {
      const on = selected(group);
      if (!on) return false;
      on.classList.remove("is-on");
      on.setAttribute("aria-pressed", "false");
      return true;
    });
    state.profile = null;
    updateSummary();
  });

  document.getElementById("btn-enter").addEventListener("click", function () {
    const raw = readForm();
    const error = validate(raw);
    formError.textContent = error;
    if (error) return;
    enterApp(raw);
  });

  document.getElementById("btn-listen").addEventListener("click", function () { playWelcome(true); });
  document.getElementById("btn-stop").addEventListener("click", stopVoice);
  document.getElementById("lesson-listen").addEventListener("click", function () {
    speak(document.getElementById("lesson-caption").textContent || WELCOME_LINE);
  });
  document.getElementById("lesson-stop").addEventListener("click", stopVoice);
  document.getElementById("to-login").addEventListener("click", function () {
    showHome();
    document.getElementById("journey").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.getElementById("brand-home").addEventListener("click", function (event) {
    event.preventDefault();
    stopVoice();
    showHome();
  });
  document.getElementById("back-home").addEventListener("click", function () {
    stopVoice();
    showHome();
  });
  document.getElementById("btn-all-lessons").addEventListener("click", function () {
    document.getElementById("lessons").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("btn-clips").addEventListener("click", function () {
    const panel = document.getElementById("clip-panel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      fillClipInputs();
      const first = panel.querySelector("input");
      if (first) first.focus();
    }
  });
  document.getElementById("clip-panel").addEventListener("submit", function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const next = {};
    let invalid = false;
    form.querySelectorAll("[data-clip]").forEach(function (input) {
      const raw = input.value.trim();
      const id = youtubeId(raw);
      if (raw && !id) {
        invalid = true;
        input.setCustomValidity("الصق رابط يوتيوب كامل، مثل youtube.com أو youtu.be");
      } else {
        input.setCustomValidity("");
      }
      next[input.dataset.clip] = id ? raw : "";
    });
    const ok = form.reportValidity();
    if (invalid || !ok) return;
    try { localStorage.setItem(VIDEO_KEY, JSON.stringify(next)); } catch (err) { /* العرض يكمل */ }
    paintLessons();
    document.getElementById("clip-status").textContent = "انحفظت المقاطع على هذا الجهاز وتظهر عند فتح الدرس. عشان كل الناس تشوفها في الرابط، أرسل لي الروابط وأرفعها مع الموقع.";
  });
  document.querySelectorAll(".lesson").forEach(function (button) {
    button.addEventListener("click", function () { openLesson(button); });
  });
  document.querySelectorAll(".nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (!screenApp.hidden) showHome();
      document.querySelectorAll(".nav a").forEach(function (item) { item.classList.remove("is-on"); });
      link.classList.add("is-on");
    });
  });
  document.getElementById("ask-form").addEventListener("submit", function (event) {
    event.preventDefault();
    submitText(document.getElementById("ask-input").value);
  });
  document.getElementById("ask-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      document.getElementById("ask-form").requestSubmit();
    }
  });

  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = pickVoice;
  cloneCharacters();
  try {
    const saved = JSON.parse(localStorage.getItem("tibyan.profile.v1") || "null");
    if (saved && saved.ageFrom && saved.gender && saved.hearing) {
      document.querySelectorAll(".pick").forEach(function (button) {
        const ageOn = button.dataset.group === "age" && Number(button.dataset.from) === Number(saved.ageFrom);
        const otherOn = button.dataset.value === saved.gender || button.dataset.value === saved.hearing;
        const on = ageOn || otherOn;
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
  } catch (err) { /* تجاهل */ }
  updateSummary();
  paintLessons();
  showHome();
  playWelcome(false);
})();
