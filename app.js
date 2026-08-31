(function () {
  "use strict";

  var RUN_SECONDS = 8 * 60;
  var MEETING_AT = 7 * 60;
  var ARRIVAL_SLOTS = [18, 58, 105, 165, 235, 315];
  var TASKS = {
    attendance: { title: "Dochádzka 2.B", sender: "Triedna kniha", summary: "Zadaj päť chýbajúcich žiakov.", icon: "D", tone: "blue", important: true },
    parent: { title: "Preverenie známky", sender: "Ing. Peter Hudák · rodič", summary: "Očakávam vysvetlenie ešte dnes.", icon: "R", tone: "orange", important: true },
    principal: { title: "DÔLEŽITÉ: Doplnenie POPR", sender: "PaedDr. Mária Kováčová · riaditeľka", summary: "Doplň názov online inovačného vzdelávania.", icon: "V", tone: "violet", important: true },
    substitution: { title: "Zastupovanie 4.A", sender: "Zástupkyňa školy", summary: "Môžeš zastúpiť 6. hodinu?", icon: "Z", tone: "sand" },
    colleague: { title: "Dozor na chodbe", sender: "Katarína · kolegyňa", summary: "Potrebujem si na päť minút odbehnúť.", icon: "K", tone: "green" },
    student: { title: "Zabudnutý projekt", sender: "Samuel · 2.B", summary: "Môžem ho priniesť zajtra?", icon: "S", tone: "blue" }
  };
  var STUDENTS = ["Baláž", "Bednár", "Gašparová", "Horváthová", "Hudáková", "Kováčová", "Lechner", "Lukáčová", "Mikulová", "Molnár", "Nagy", "Novák", "Polák", "Rusnáková", "Sedlák", "Slováková", "Szabó", "Tóthová", "Urbanová", "Varga J.", "Varga M."];
  var ABSENT = ["Baláž", "Horváthová", "Kováčová", "Molnár", "Varga M."];
  var MEETING_BRIEFS = [
    "Tlačiareň má toner už len na dva dni a v sklade ostal jeden balík papiera.",
    "V chemickom laboratóriu je šesť ochranných okuliarov poškodených.",
    "Zajtra je školská akadémia a jediný mikrofón dnes prestal fungovať.",
    "V jazykovej učebni vypadáva Wi-Fi a šestnásť tabletov sa nevie pripojiť k online testom."
  ];
  var COURSES = ["Digitálne nástroje vo vyučovaní", "Inkluzívna trieda v praxi", "Kyberbezpečnosť pre školy"];
  var root = document.getElementById("app");
  var timer = null;
  var loginTimer = null;
  var audioContext = null;
  var bubbleAnimationFrame = null;
  var bubbleMotions = [];
  var suppressSheetAnimation = false;
  var state = freshState();

  function freshState() {
    return {
      phase: "intro",
      plan: [],
      studentOrder: STUDENTS.slice(),
      meetingBrief: MEETING_BRIEFS[0],
      startedAt: 0,
      simSeconds: 0,
      speedFactor: new URLSearchParams(location.search).get("demo") === "1" ? 20 : 1,
      openItem: null,
      popup: null,
      filter: "all",
      read: new Set(),
      resolved: new Set(),
      announced: new Set(),
      meetingOpened: false,
      soundOn: true,
      selectedStudents: [],
      attendanceError: "",
      parentReply: "",
      parentError: "",
      catalogOpen: false,
      principalAnswer: "",
      principalError: "",
      substitutionDecision: "",
      substitutionAnswer: "",
      substitutionError: "",
      meetingBudget: { print: 0, lab: 0, mic: 0, wifi: 0 },
      paperChecks: [false, false, false]
    };
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function shuffled(items) {
    var result = items.slice();
    for (var index = result.length - 1; index > 0; index -= 1) {
      var swap = Math.floor(Math.random() * (index + 1));
      var temp = result[index];
      result[index] = result[swap];
      result[swap] = temp;
    }
    return result;
  }

  function pickMeetingBrief() {
    var previous = -1;
    try {
      var savedBrief = sessionStorage.getItem("teacher-simulation-last-brief");
      if (savedBrief !== null) previous = Number(savedBrief);
    } catch (error) {}
    var choices = MEETING_BRIEFS.map(function (_, index) { return index; }).filter(function (index) { return index !== previous; });
    var selected = choices[Math.floor(Math.random() * choices.length)];
    try { sessionStorage.setItem("teacher-simulation-last-brief", String(selected)); } catch (error) {}
    return MEETING_BRIEFS[selected];
  }

  function formatTime(seconds) {
    var safe = Math.max(0, Math.ceil(seconds));
    var minutes = Math.floor(safe / 60);
    var remainder = safe % 60;
    return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function brand() {
    return '<div class="brand-lockup"><img src="assets/brand/logo-white.svg" alt="5PEŇAZÍ"></div>';
  }

  function glyph(task) {
    return '<span class="task-glyph task-glyph--' + task.tone + '">' + task.icon + "</span>";
  }

  function start() {
    unlockAudio();
    state = freshState();
    state.phase = "login";
    render();
    clearTimeout(loginTimer);
    loginTimer = setTimeout(beginSimulation, 1100);
  }

  function beginSimulation() {
    state.phase = "active";
    state.plan = shuffled(Object.keys(TASKS)).map(function (id, index) { return { id: id, at: ARRIVAL_SLOTS[index] }; });
    state.studentOrder = STUDENTS.slice();
    state.meetingBrief = pickMeetingBrief();
    state.startedAt = Date.now();
    render();
    clearInterval(timer);
    timer = setInterval(tick, 250);
  }

  function tick() {
    if (state.phase !== "active") return;
    var needsRender = false;
    state.simSeconds = Math.min(RUN_SECONDS, ((Date.now() - state.startedAt) / 1000) * state.speedFactor);
    var arrived = getArrived();
    var newest = arrived.find(function (item) { return !state.announced.has(item.id); });
    if (newest) {
      state.announced.add(newest.id);
      state.popup = newest.id;
      needsRender = true;
      if (state.soundOn) notify(false);
    }
    if (state.simSeconds >= MEETING_AT && !state.meetingOpened) {
      state.meetingOpened = true;
      state.read.add("meeting");
      state.popup = null;
      state.openItem = "meeting";
      needsRender = true;
      if (state.soundOn) notifyMeeting();
    }
    if (state.simSeconds >= RUN_SECONDS) {
      clearInterval(timer);
      state.phase = "done";
      state.openItem = null;
      state.popup = null;
      render();
      return;
    }
    if (needsRender) render();
    else updateTimerDisplay();
  }

  function updateTimerDisplay() {
    var remaining = RUN_SECONDS - state.simSeconds;
    var timerElement = root.querySelector(".timer");
    var progressElement = root.querySelector(".progress-track span");
    if (timerElement) {
      timerElement.textContent = formatTime(remaining);
      timerElement.classList.toggle("timer--urgent", remaining <= 60);
    }
    if (progressElement) {
      progressElement.style.width = Math.min(100, state.simSeconds / RUN_SECONDS * 100) + "%";
    }
    var meetingCountdown = root.querySelector(".meeting-countdown");
    if (meetingCountdown) meetingCountdown.textContent = formatTime(remaining);
  }

  function notify(urgent) {
    if (navigator.vibrate) navigator.vibrate(urgent ? [180, 80, 180, 80, 240] : [130, 70, 130]);
    try {
      if (!audioContext) unlockAudio();
      var context = audioContext;
      if (!context) return;
      if (context.state === "suspended") context.resume();
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.frequency.value = urgent ? 760 : 620;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.11, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    } catch (error) {}
  }

  function unlockAudio() {
    try {
      var AudioConstructor = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && AudioConstructor) audioContext = new AudioConstructor();
      if (audioContext && audioContext.state === "suspended") audioContext.resume();
    } catch (error) {}
  }

  function notifyMeeting() {
    if (navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 320]);
    try {
      if (!audioContext) unlockAudio();
      var context = audioContext;
      if (!context) return;
      if (context.state === "suspended") context.resume();
      [0, 0.42].forEach(function (delay, strikeIndex) {
        [880, 1320, 1760].forEach(function (frequency, harmonicIndex) {
          var oscillator = context.createOscillator();
          var gain = context.createGain();
          var startAt = context.currentTime + delay;
          var strength = (strikeIndex === 0 ? 0.12 : 0.085) / (harmonicIndex + 1);
          oscillator.type = harmonicIndex === 0 ? "sine" : "triangle";
          oscillator.frequency.setValueAtTime(frequency, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(strength, startAt + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.72);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.75);
        });
      });
    } catch (error) {}
  }

  function getArrived() {
    return state.plan.filter(function (item) { return item.at <= state.simSeconds; }).sort(function (a, b) { return b.at - a.at; });
  }

  function openTask(id) {
    state.read.add(id);
    state.popup = null;
    state.openItem = id;
    render();
  }

  function resolveTask(id) {
    state.read.add(id);
    state.resolved.add(id);
    state.openItem = null;
    state.popup = null;
    render();
  }

  function renderIntro() {
    var loggingIn = state.phase === "login";
    return [
      '<main class="simulation-shell intro-shell">',
      '<header class="brand-bar">', brand(), '<span class="mode-pill">UČITEĽSKÝ REŽIM</span></header>',
      '<section class="welcome-panel"><div class="welcome-bubble"><span class="eyebrow">VITAJ V ZBOROVNI</span>',
      '<h1>Dnes učíš ty.</h1><p>Máš 8 minút na tvorbu testu. Popritom reaguj na situácie, ktoré prináša bežný učiteľský deň.</p></div>',
      '<button class="start-button ', loggingIn ? "start-button--loading" : "", '" data-action="start"', loggingIn ? " disabled" : "", '>',
      loggingIn ? '<span class="login-spinner" aria-hidden="true"><i></i><i></i><i></i></span><span>Prihlasujem do EDU Page…</span>' : '<span>Prihlásiť sa do EDU Page</span><b>→</b>',
      '</button>',
      '<p class="start-note">Pracovný list maj pred sebou. Po prihlásení sa spustí 8-minútový čas.</p></section>',
      '<img class="decorative-bubble decorative-bubble--one" src="assets/brand/bubble-star.svg" alt="" draggable="false"><img class="decorative-bubble decorative-bubble--two" src="assets/brand/bubble-round.svg" alt="" draggable="false"><img class="decorative-bubble decorative-bubble--three" src="assets/brand/bubble-speech.svg" alt="" draggable="false"></main>'
    ].join("");
  }

  function renderDone() {
    var labels = ["Mám aspoň 5 otázok a možnosti a / b / c.", "Otestoval/a som aspoň jedného spolužiaka.", "Vyhodnotil/a som test a napísal/a odporúčanie."];
    var total = state.plan.length + 1;
    return [
      '<main class="result-shell"><section class="result-card">', brand(),
      '<div class="result-bubble"><span class="eyebrow">8 MINÚT UPLYNULO</span><h1>Smena skončila.</h1><p>Počas tvorby testu ti prišlo ', total, ' ďalších požiadaviek. Takto vyzerala len krátka vzorka učiteľského dňa.</p></div>',
      '<div class="score-strip"><div><strong>', state.resolved.size, '</strong><span>vybavených</span></div><div><strong>', total - state.resolved.size, '</strong><span>ostalo v agende</span></div></div>',
      '<div class="paper-check"><span class="section-kicker">SKONTROLUJ PAPIER</span>',
      labels.map(function (label, index) {
        return '<label class="paper-check-row"><input type="checkbox" data-paper="' + index + '"' + (state.paperChecks[index] ? " checked" : "") + '><span>' + label + "</span></label>";
      }).join(""),
      '</div><div class="reflection-bubble"><strong>Čo bolo najťažšie?</strong><p>Dokončiť jednu úlohu, alebo stále prepínať pozornosť?</p></div>',
      '<button class="secondary-button" data-action="finish">Ukončiť</button></section></main>'
    ].join("");
  }

  function renderFarewell() {
    return [
      '<main class="farewell-shell"><section class="farewell-card">', brand(),
      '<div class="farewell-bubble"><span class="eyebrow">SIMULÁCIA JE UKONČENÁ</span><h1>Ďakujeme.</h1><p>Pokračujeme vo vzdelávaní, pretože každá nová skúsenosť nám pomáha lepšie rozumieť práci druhých.</p></div>',
      '<div class="farewell-note"><strong>Dnes si učil/a ty.</strong><span>Odnes si túto skúsenosť so sebou.</span></div>',
      '</section></main>'
    ].join("");
  }

  function renderActive() {
    var arrived = getArrived();
    var meetingArrived = state.simSeconds >= MEETING_AT;
    var unresolvedMeeting = meetingArrived && !state.resolved.has("meeting");
    var unread = arrived.filter(function (item) { return !state.read.has(item.id); }).length + (meetingArrived && !state.read.has("meeting") ? 1 : 0);
    var visible = arrived.filter(function (item) {
      if (state.filter === "pending") return !state.resolved.has(item.id);
      if (state.filter === "done") return state.resolved.has(item.id);
      return true;
    });
    var remaining = RUN_SECONDS - state.simSeconds;
    var progress = Math.min(100, state.simSeconds / RUN_SECONDS * 100);
    var list = visible.length ? visible.map(renderNotification).join("") : renderEmptyState();
    return [
      '<main class="active-shell"><div class="phone-app"><header class="app-header"><div class="app-header__top">', brand(),
      '<div class="agenda-count"><span>', unread, '</span><small>nové správy</small></div></div>',
      '<div class="timer-row"><div><span class="section-kicker section-kicker--light">ZOSTÁVA</span><strong class="timer ', remaining <= 60 ? "timer--urgent" : "", '">', formatTime(remaining), '</strong></div></div>',
      '<div class="progress-track"><span style="width:', progress, '%"></span></div></header>',
      '<section class="dashboard-head"><span class="section-kicker">EDU PAGE</span><div class="dashboard-title-row"><div><h1>Tvoja agenda</h1><p>Pokračuj na teste a priebežne reaguj.</p></div><span class="avatar">U</span></div></section>',
      unresolvedMeeting ? '<button class="meeting-reminder" data-open="meeting"><span class="meeting-reminder__burst">!</span><span><strong>Porada práve prebieha</strong><small>Dohodnite sa v zborovni.</small></span><span>→</span></button>' : "",
      '<div class="filter-tabs" aria-label="Filtrovanie agendy">',
      filterButton("all", "Všetko"), filterButton("pending", "Nevybavené"), filterButton("done", "Vybavené"),
      '</div><section class="notification-list" aria-live="polite">', list, '</section>',
      '</div>',
      renderToast(), state.openItem ? renderModal(state.openItem) : "", '</main>'
    ].join("");
  }

  function renderEmptyState() {
    if (state.filter === "pending") {
      return '<div class="quiet-state"><div class="quiet-bubble">×</div><strong>Žiadne nevybavené úlohy.</strong><p>Tu nájdeš svoje nevybavené úlohy.</p></div>';
    }
    if (state.filter === "done") {
      return '<div class="quiet-state"><div class="quiet-bubble">✓</div><strong>Zatiaľ nič vybavené.</strong><p>Tu nájdeš úlohy, ktoré si už vybavil/a.</p></div>';
    }
    return '<div class="quiet-state"><div class="quiet-bubble">…</div><strong>Ticho pred búrkou.</strong><p>Pracuj na papieri. Prvé upozornenie príde čoskoro.</p></div>';
  }

  function filterButton(value, label) {
    return '<button class="filter-tab ' + (state.filter === value ? "filter-tab--active" : "") + '" data-filter="' + value + '">' + label + "</button>";
  }

  function renderNotification(item) {
    var task = TASKS[item.id];
    var read = state.read.has(item.id);
    var done = state.resolved.has(item.id);
    var stateClass = done ? "notification-state--done" : !read ? "notification-state--unread" : "notification-state--chevron";
    var stateIcon = done ? "✓" : "";
    return [
      '<button class="notification-row ', !read ? "notification-row--unread" : "", '" data-open="', item.id, '">', glyph(task),
      '<span class="notification-copy"><span class="notification-meta">', task.sender, task.important ? "<em>DÔLEŽITÉ</em>" : "", '</span><strong>', task.title, '</strong><small>', done ? "Vybavené" : task.summary, '</small></span>',
      '<span class="notification-state ', stateClass, '" aria-hidden="true">', stateIcon, "</span></button>"
    ].join("");
  }

  function renderToast() {
    if (!state.popup || state.popup === "meeting") return "";
    var task = TASKS[state.popup];
    return [
      '<div class="intrusion-toast" role="alert"><button class="toast-main" data-open="', state.popup, '">', glyph(task),
      '<span><small>Nové upozornenie · teraz</small><strong>', task.title, '</strong><em>', task.summary, '</em></span></button>',
      '<button class="toast-close" data-action="close-toast" aria-label="Zavrieť upozornenie">×</button></div>'
    ].join("");
  }

  function heading(task) {
    return '<div class="sheet-heading">' + glyph(task) + '<div><span>' + task.sender + "</span><h2>" + task.title + "</h2></div></div>";
  }

  function renderModal(id) {
    var meeting = id === "meeting";
    return '<div class="task-layer ' + (meeting ? "task-layer--meeting " : "") + (suppressSheetAnimation ? "task-layer--steady" : "") + '"><div class="task-sheet"><div class="sheet-handle"></div><button class="sheet-close" data-action="close-modal">×</button>' + renderTask(id) + "</div></div>";
  }

  function renderTask(id) {
    if (id === "attendance") {
      return heading(TASKS.attendance) + '<div class="instruction-bubble instruction-bubble--blue">Dnes chýbajú: Baláž, Horváthová, Kováčová, Molnár a Varga M.</div><p class="sheet-instruction">Označ presne päť mien a potvrď dochádzku.</p><div class="student-grid">' +
        state.studentOrder.map(function (name) {
          var selected = state.selectedStudents.indexOf(name) >= 0;
          return '<label class="student-option ' + (selected ? "student-option--selected" : "") + '"><input type="checkbox" data-student="' + esc(name) + '"' + (selected ? " checked" : "") + '><span>' + name + "</span></label>";
        }).join("") + "</div>" + error(state.attendanceError) + '<button class="action-button" data-action="attendance">Potvrdiť dochádzku (' + state.selectedStudents.length + "/5)</button>";
    }
    if (id === "parent") {
      return heading(TASKS.parent) + '<div class="message-card message-card--urgent"><p>Dobrý deň, pani učiteľka,</p><p>dnes som si v EduPage otvoril známky mojej dcéry a ostal som v úplnom šoku. Dali ste jej z poslednej písomky z matematiky známku 4!</p><p>Dcéra sa poctivo pripravovala. Výsledok mala správny, iba nepoužila presne Váš postup. Považujem hodnotenie za neprimerane prísne a subjektívne.</p><p>Žiadam okamžité vysvetlenie a preverenie písomky. Očakávam odpoveď ešte dnes, inak budem situáciu riešiť s vedením školy.</p><p>S pozdravom, Ing. Peter Hudák</p></div><label class="field-label" for="parent-reply">Tvoja odpoveď</label><textarea id="parent-reply" rows="5" placeholder="Dobrý deň, rozumiem, že vás známka znepokojila…">' + esc(state.parentReply) + '</textarea><p class="field-help">Vecne, pokojne a s jasným ďalším krokom.</p>' + error(state.parentError) + '<button class="action-button" data-action="parent">Odoslať odpoveď</button>';
    }
    if (id === "principal") {
      return heading(TASKS.principal) + '<div class="message-card message-card--director"><p>Vážené kolegyne, vážení kolegovia,</p><p>napriek opakovaným upozorneniam v POPR stále chýbajú konkrétne názvy programov inovačného vzdelávania. Už včera bolo neskoro.</p><p>Doplňte konkrétny názov online programu OKAMŽITE. Ignorovanie termínu budem riešiť osobne na vedení školy.</p><p>PaedDr. Mária Kováčová, riaditeľka školy</p></div><button class="catalog-button" data-action="catalog">' + (state.catalogOpen ? "Zavrieť katalóg" : "Vyhľadať v katalógu vzdelávaní") + '<span>↗</span></button>' +
        (state.catalogOpen ? '<div class="catalog-results"><span class="section-kicker">DOSTUPNÉ ONLINE PROGRAMY</span>' + COURSES.map(function (course) { return '<button data-course="' + esc(course) + '"><span>' + course + '</span><small>online · inovačné vzdelávanie</small></button>'; }).join("") + "</div>" : "") +
        '<label class="field-label" for="course-answer">Názov programu do odpovede</label><input id="course-answer" type="text" value="' + esc(state.principalAnswer) + '" placeholder="Napíš alebo vyber názov">' + error(state.principalError) + '<button class="action-button" data-action="principal">Doplniť a odpovedať</button>';
    }
    if (id === "substitution") {
      var acceptsSubstitution = state.substitutionDecision === "accept";
      var replyField = state.substitutionDecision ?
        '<label class="field-label" for="substitution-reply">' + (acceptsSubstitution ? "Správa rodičovi" : "Správa zástupkyni") + '</label><textarea id="substitution-reply" rows="4" placeholder="' + (acceptsSubstitution ? "Dobrý deň, pre nečakané zastupovanie potrebujem našu dnešnú konzultáciu presunúť. Mohli by sme sa stretnúť…" : "Ahoj, zastupovanie, žiaľ, nemôžem prevziať, pretože mám v tom čase dohodnutú konzultáciu s rodičom…") + '">' + esc(state.substitutionAnswer) + '</textarea><p class="field-help">' + (acceptsSubstitution ? "Vysvetli situáciu a navrhni rodičovi konkrétny náhradný termín." : "Odmietni jasne a uveď, že máš dohodnutú konzultáciu s rodičom.") + '</p>' :
        '<p class="decision-hint">Najskôr si vyber, či zastupovanie prijmeš.</p>';
      return heading(TASKS.substitution) + '<div class="instruction-bubble instruction-bubble--sand">Kolegyňa ochorela. Potrebujeme zastúpiť fyziku v 4.A na 6. hodinu.</div><p class="sheet-instruction">V tom čase máš dohodnutú konzultáciu s rodičom. Zastupovanie môžeš prijať a konzultáciu presunúť, alebo ho odmietnuť. Najskôr sa rozhodni.</p><div class="choice-stack substitution-choices"><button class="choice ' + (state.substitutionDecision === "accept" ? "choice--selected" : "") + '" data-substitution-decision="accept">Zoberiem zastupovanie</button><button class="choice ' + (state.substitutionDecision === "decline" ? "choice--selected" : "") + '" data-substitution-decision="decline">Nezoberiem zastupovanie</button></div>' + replyField + error(state.substitutionError) + '<button class="action-button" data-action="substitution"' + (state.substitutionDecision ? "" : " disabled") + '>Odoslať odpoveď</button>';
    }
    if (id === "colleague") {
      return heading(TASKS.colleague) + '<div class="chat-thread"><div class="chat-bubble">Ahoj, potrebujem si počas veľkej prestávky na päť minút odbehnúť. Postrážiš aj moju časť chodby? Vďaka!</div></div><div class="quick-replies"><button data-resolve="colleague">Áno, postrážim.</button><button data-resolve="colleague">Dnes to nestíham.</button></div>';
    }
    if (id === "student") {
      return heading(TASKS.student) + '<div class="chat-thread"><div class="chat-bubble chat-bubble--student">Dobrý deň, projekt mám hotový, ale zabudol som ho doma. Môžem ho priniesť zajtra bez zníženia známky?</div></div><div class="quick-replies quick-replies--vertical"><button data-resolve="student">Áno, prines ho zajtra.</button><button class="quick-reply--negative" data-resolve="student">Termín bol včera. Mal si čas odovzdať ho do včera, preto ho už nemôžem prijať bez následkov.</button></div>';
    }
    return renderMeeting();
  }

  function renderMeeting() {
    var total = Object.keys(state.meetingBudget).reduce(function (sum, key) { return sum + state.meetingBudget[key]; }, 0);
    var options = [["print", "Toner + papier", "potreba 280 €"], ["lab", "Ochranné okuliare", "potreba 300 €"], ["mic", "Bezdrôtový mikrofón", "potreba 295 €"], ["wifi", "Wi-Fi router", "potreba 260 €"]];
    var meetingRemaining = RUN_SECONDS - state.simSeconds;
    return [
      '<div class="meeting-topline"><span class="meeting-label">POSLEDNÁ MINÚTA</span><strong class="meeting-countdown" aria-label="Zostávajúci čas">', formatTime(meetingRemaining), '</strong></div><h2 class="meeting-title">Porada v zborovni</h2>',
      '<p class="meeting-lead">Ako zborovňa sa dohodnite, ako rozdelíte 300 € medzi štyri naliehavé potreby.</p>',
      '<div class="personal-brief"><span>INFORMÁCIA PRE PORADU</span><strong>', state.meetingBrief, '</strong></div>',
      '<p class="meeting-instruction">Prečítajte si podklady, diskutujte a na každom mobile zapíšte rovnaké sumy. Spolu musia dať presne 300 €.</p>',
      '<div class="meeting-options">', options.map(function (option) {
        var fieldMaximum = 300 - total + state.meetingBudget[option[0]];
        return '<label class="meeting-option"><span><strong>' + option[1] + '</strong><small>' + option[2] + '</small></span><span class="meeting-amount"><input type="number" min="0" max="' + fieldMaximum + '" step="5" inputmode="numeric" data-budget="' + option[0] + '" value="' + state.meetingBudget[option[0]] + '"><b>€</b></span></label>';
      }).join(""), '</div>',
      '<div class="meeting-total ', total === 300 ? "meeting-total--ready" : "", '" aria-live="polite"><span>Rozdelené · maximum 300 €</span><strong id="meeting-total-value">', total, ' / 300 €</strong></div>',
      '<button id="meeting-submit" class="action-button action-button--meeting" data-action="meeting"', total === 300 ? "" : " disabled", '>Potvrdiť spoločné rozdelenie</button>'
    ].join("");
  }

  function error(message) {
    return message ? '<p class="form-error">' + esc(message) + "</p>" : "";
  }

  function render() {
    root.innerHTML = state.phase === "intro" || state.phase === "login" ? renderIntro() : state.phase === "done" ? renderDone() : state.phase === "farewell" ? renderFarewell() : renderActive();
    setupInteractiveBubbles();
  }

  function setupInteractiveBubbles() {
    if (bubbleAnimationFrame !== null) cancelAnimationFrame(bubbleAnimationFrame);
    bubbleAnimationFrame = null;
    bubbleMotions = [];

    var shell = root.querySelector(".intro-shell");
    if (!shell) return;

    root.querySelectorAll(".decorative-bubble").forEach(function (bubble) {
      var motion = {
        element: bubble,
        baseLeft: 0,
        baseTop: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        velocityX: 0,
        velocityY: 0,
        lastX: 0,
        lastY: 0,
        lastTime: 0,
        samples: [],
        dragging: false,
        active: false
      };
      bubbleMotions.push(motion);

      bubble.addEventListener("pointerdown", function (event) {
        if (state.phase !== "intro" && state.phase !== "login") return;
        event.preventDefault();
        activateBubbleWorld(shell);
        motion.dragging = true;
        motion.velocityX = 0;
        motion.velocityY = 0;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        motion.lastTime = performance.now();
        motion.samples = [{ x: event.clientX, y: event.clientY, time: motion.lastTime }];
        bubble.classList.add("decorative-bubble--dragging");
        bubble.setPointerCapture(event.pointerId);
      });

      bubble.addEventListener("pointermove", function (event) {
        if (!motion.dragging) return;
        if (event.buttons === 0) return releaseBubble(event);
        event.preventDefault();
        var now = performance.now();
        var elapsed = Math.max(8, now - motion.lastTime);
        var deltaX = event.clientX - motion.lastX;
        var deltaY = event.clientY - motion.lastY;
        motion.x += deltaX;
        motion.y += deltaY;
        clampBubble(motion, shell);
        motion.velocityX = deltaX / elapsed;
        motion.velocityY = deltaY / elapsed;
        motion.lastX = event.clientX;
        motion.lastY = event.clientY;
        motion.lastTime = now;
        motion.samples.push({ x: event.clientX, y: event.clientY, time: now });
        motion.samples = motion.samples.filter(function (sample) { return now - sample.time <= 140; });
        positionBubble(motion);
      });

      function releaseBubble(event) {
        if (!motion.dragging) return;
        motion.dragging = false;
        if (motion.samples.length > 1) {
          var firstSample = motion.samples[0];
          var lastSample = motion.samples[motion.samples.length - 1];
          var sampleTime = Math.max(8, lastSample.time - firstSample.time);
          motion.velocityX = (lastSample.x - firstSample.x) / sampleTime;
          motion.velocityY = (lastSample.y - firstSample.y) / sampleTime;
        }
        bubble.classList.remove("decorative-bubble--dragging");
        if (bubble.hasPointerCapture(event.pointerId)) bubble.releasePointerCapture(event.pointerId);
        startBubbleMotion(shell);
      }

      bubble.addEventListener("pointerup", releaseBubble);
      bubble.addEventListener("pointercancel", releaseBubble);
      bubble.addEventListener("lostpointercapture", releaseBubble);
    });
  }

  function positionBubble(motion) {
    motion.element.style.translate = motion.x.toFixed(2) + "px " + motion.y.toFixed(2) + "px";
  }

  function activateBubbleWorld(shell) {
    var shellRect = shell.getBoundingClientRect();
    bubbleMotions.forEach(function (motion) {
      if (motion.active) return;
      var bubbleRect = motion.element.getBoundingClientRect();
      motion.baseLeft = bubbleRect.left - shellRect.left;
      motion.baseTop = bubbleRect.top - shellRect.top;
      motion.width = bubbleRect.width;
      motion.height = bubbleRect.height;
      motion.x = 0;
      motion.y = 0;
      motion.active = true;
      motion.element.style.animationPlayState = "paused";
    });
  }

  function clampBubble(motion, shell) {
    var minimumX = -motion.baseLeft;
    var minimumY = -motion.baseTop;
    var maximumX = shell.clientWidth - motion.baseLeft - motion.width;
    var maximumY = shell.clientHeight - motion.baseTop - motion.height;
    motion.x = Math.min(maximumX, Math.max(minimumX, motion.x));
    motion.y = Math.min(maximumY, Math.max(minimumY, motion.y));
  }

  function resolveBubbleCollisions(shell) {
    for (var firstIndex = 0; firstIndex < bubbleMotions.length; firstIndex += 1) {
      var first = bubbleMotions[firstIndex];
      if (!first.active) continue;
      for (var secondIndex = firstIndex + 1; secondIndex < bubbleMotions.length; secondIndex += 1) {
        var second = bubbleMotions[secondIndex];
        if (!second.active) continue;

        var firstRadius = Math.min(first.width, first.height) * 0.42;
        var secondRadius = Math.min(second.width, second.height) * 0.42;
        var firstCenterX = first.baseLeft + first.x + first.width / 2;
        var firstCenterY = first.baseTop + first.y + first.height / 2;
        var secondCenterX = second.baseLeft + second.x + second.width / 2;
        var secondCenterY = second.baseTop + second.y + second.height / 2;
        var differenceX = secondCenterX - firstCenterX;
        var differenceY = secondCenterY - firstCenterY;
        var distance = Math.hypot(differenceX, differenceY);
        var minimumDistance = firstRadius + secondRadius;
        if (distance >= minimumDistance) continue;

        if (distance < 0.001) {
          differenceX = 1;
          differenceY = 0;
          distance = 1;
        }
        var normalX = differenceX / distance;
        var normalY = differenceY / distance;
        var inverseMassFirst = first.dragging ? 0 : 1 / (firstRadius * firstRadius);
        var inverseMassSecond = second.dragging ? 0 : 1 / (secondRadius * secondRadius);
        var inverseMassTotal = inverseMassFirst + inverseMassSecond;
        if (!inverseMassTotal) continue;

        var overlap = minimumDistance - distance;
        first.x -= normalX * overlap * inverseMassFirst / inverseMassTotal;
        first.y -= normalY * overlap * inverseMassFirst / inverseMassTotal;
        second.x += normalX * overlap * inverseMassSecond / inverseMassTotal;
        second.y += normalY * overlap * inverseMassSecond / inverseMassTotal;

        var relativeSpeed = (second.velocityX - first.velocityX) * normalX + (second.velocityY - first.velocityY) * normalY;
        if (relativeSpeed < 0) {
          var impulse = -(1 + 0.88) * relativeSpeed / inverseMassTotal;
          first.velocityX -= impulse * inverseMassFirst * normalX;
          first.velocityY -= impulse * inverseMassFirst * normalY;
          second.velocityX += impulse * inverseMassSecond * normalX;
          second.velocityY += impulse * inverseMassSecond * normalY;
        }

        clampBubble(first, shell);
        clampBubble(second, shell);
      }
    }
  }

  function startBubbleMotion(shell) {
    if (bubbleAnimationFrame !== null) return;
    var previousTime = performance.now();

    function animate(now) {
      if (!shell.isConnected) {
        bubbleAnimationFrame = null;
        return;
      }
      var elapsed = Math.min(34, Math.max(8, now - previousTime));
      previousTime = now;
      var moving = false;

      bubbleMotions.forEach(function (motion) {
        if (!motion.active || motion.dragging) return;
        var oldX = motion.x;
        var oldY = motion.y;
        motion.x += motion.velocityX * elapsed;
        motion.y += motion.velocityY * elapsed;
        clampBubble(motion, shell);
        if (motion.x !== oldX + motion.velocityX * elapsed) motion.velocityX *= -0.76;
        if (motion.y !== oldY + motion.velocityY * elapsed) motion.velocityY *= -0.76;
        var friction = Math.pow(0.985, elapsed / 16.67);
        motion.velocityX *= friction;
        motion.velocityY *= friction;
        if (Math.abs(motion.velocityX) < 0.002) motion.velocityX = 0;
        if (Math.abs(motion.velocityY) < 0.002) motion.velocityY = 0;
      });

      resolveBubbleCollisions(shell);
      resolveBubbleCollisions(shell);
      bubbleMotions.forEach(function (motion) {
        if (!motion.active) return;
        clampBubble(motion, shell);
        positionBubble(motion);
        if (motion.dragging || motion.velocityX || motion.velocityY) moving = true;
      });

      if (moving) bubbleAnimationFrame = requestAnimationFrame(animate);
      else bubbleAnimationFrame = null;
    }

    bubbleAnimationFrame = requestAnimationFrame(animate);
  }

  function renderSteady() {
    var currentSheet = root.querySelector(".task-sheet");
    var scrollTop = currentSheet ? currentSheet.scrollTop : 0;
    suppressSheetAnimation = true;
    render();
    suppressSheetAnimation = false;
    var nextSheet = root.querySelector(".task-sheet");
    if (nextSheet) nextSheet.scrollTop = scrollTop;
  }

  root.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.open) return openTask(target.dataset.open);
    if (target.dataset.filter) { state.filter = target.dataset.filter; return render(); }
    if (target.dataset.resolve) return resolveTask(target.dataset.resolve);
    if (target.dataset.course) { state.principalAnswer = target.dataset.course; state.principalError = ""; return renderSteady(); }
    if (target.dataset.substitutionDecision) {
      if (state.substitutionDecision !== target.dataset.substitutionDecision) state.substitutionAnswer = "";
      state.substitutionDecision = target.dataset.substitutionDecision;
      state.substitutionError = "";
      return renderSteady();
    }
    var action = target.dataset.action;
    if (action === "start") return start();
    if (action === "restart") { clearInterval(timer); clearTimeout(loginTimer); state = freshState(); return render(); }
    if (action === "finish") { state.phase = "farewell"; return render(); }
    if (action === "close-toast") { state.popup = null; return render(); }
    if (action === "close-modal") { state.openItem = null; return render(); }
    if (action === "catalog") { state.catalogOpen = !state.catalogOpen; return renderSteady(); }
    if (action === "attendance") {
      if (state.selectedStudents.length !== 5) state.attendanceError = "Vyber presne 5 mien. Teraz máš označených " + state.selectedStudents.length + ".";
      else {
        var correct = state.selectedStudents.filter(function (name) { return ABSENT.indexOf(name) >= 0; }).length;
        if (correct !== 5) state.attendanceError = "Ešte to nesedí. Správne si označil/a " + correct + " z 5 chýbajúcich.";
        else return resolveTask("attendance");
      }
      return renderSteady();
    }
    if (action === "parent") {
      if (state.parentReply.trim().length < 40) { state.parentError = "Odpoveď je príliš krátka. Uznaj obavu, navrhni preverenie a ďalší krok."; return renderSteady(); }
      return resolveTask("parent");
    }
    if (action === "principal") {
      if (state.principalAnswer.trim().length < 8) { state.principalError = "Zadaj konkrétny názov vzdelávania."; return renderSteady(); }
      return resolveTask("principal");
    }
    if (action === "substitution") {
      if (!state.substitutionDecision) { state.substitutionError = "Najskôr sa rozhodni, či zastupovanie prijmeš."; return renderSteady(); }
      if (state.substitutionAnswer.trim().length < 25) {
        state.substitutionError = state.substitutionDecision === "accept" ? "Napíš rodičovi krátke vysvetlenie a navrhni náhradný termín konzultácie." : "Napíš zástupkyni krátke odmietnutie a uveď konzultáciu s rodičom.";
        return renderSteady();
      }
      return resolveTask("substitution");
    }
    if (action === "meeting") return resolveTask("meeting");
  });

  root.addEventListener("change", function (event) {
    if (event.target.dataset.student) {
      var name = event.target.dataset.student;
      var index = state.selectedStudents.indexOf(name);
      if (index >= 0) state.selectedStudents.splice(index, 1);
      else state.selectedStudents.push(name);
      state.attendanceError = "";
      renderSteady();
    }
    if (event.target.dataset.paper !== undefined) {
      state.paperChecks[Number(event.target.dataset.paper)] = event.target.checked;
    }
  });

  root.addEventListener("input", function (event) {
    if (event.target.id === "parent-reply") { state.parentReply = event.target.value; state.parentError = ""; }
    if (event.target.id === "course-answer") { state.principalAnswer = event.target.value; state.principalError = ""; }
    if (event.target.id === "substitution-reply") { state.substitutionAnswer = event.target.value; state.substitutionError = ""; }
    if (event.target.dataset.budget) {
      var budgetKey = event.target.dataset.budget;
      var allocatedElsewhere = Object.keys(state.meetingBudget).reduce(function (sum, key) {
        return key === budgetKey ? sum : sum + state.meetingBudget[key];
      }, 0);
      var maximumForField = Math.max(0, 300 - allocatedElsewhere);
      var value = Math.min(maximumForField, Math.max(0, Number(event.target.value) || 0));
      state.meetingBudget[budgetKey] = value;
      event.target.value = value;
      var total = Object.keys(state.meetingBudget).reduce(function (sum, key) { return sum + state.meetingBudget[key]; }, 0);
      var totalBox = root.querySelector(".meeting-total");
      var totalValue = root.querySelector("#meeting-total-value");
      var submit = root.querySelector("#meeting-submit");
      totalValue.textContent = total + " / 300 €";
      totalBox.classList.toggle("meeting-total--ready", total === 300);
      submit.disabled = total !== 300;
      root.querySelectorAll("[data-budget]").forEach(function (input) {
        input.max = 300 - total + state.meetingBudget[input.dataset.budget];
      });
    }
  });

  render();
}());
