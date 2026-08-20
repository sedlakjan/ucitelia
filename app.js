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
  var STUDENTS = ["Kováčová", "Molnár", "Varga", "Horváthová", "Baláž", "Nagy", "Lukáčová", "Szabó", "Tóthová", "Hudáková", "Novák", "Slováková", "Polák", "Sedlák", "Urbanová", "Rusnáková", "Bednár", "Lechner", "Mikulová", "Gašparová"];
  var ABSENT = ["Kováčová", "Molnár", "Varga", "Horváthová", "Baláž"];
  var MEETING_BRIEFS = [
    "Tlačiareň má toner už len na dva dni a v sklade ostal jeden balík papiera.",
    "V chemickom laboratóriu je šesť ochranných okuliarov poškodených.",
    "Zajtra je školská akadémia a jediný mikrofón dnes prestal fungovať."
  ];
  var COURSES = ["Digitálne nástroje vo vyučovaní", "Inkluzívna trieda v praxi", "Kyberbezpečnosť pre školy"];
  var root = document.getElementById("app");
  var timer = null;
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
      substitutionAnswer: "",
      meetingBudget: { print: 0, lab: 0, mic: 0 },
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

  function formatTime(seconds) {
    var safe = Math.max(0, Math.ceil(seconds));
    var minutes = Math.floor(safe / 60);
    var remainder = safe % 60;
    return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function brand() {
    return '<div class="brand-lockup" aria-label="5PEŇAZÍ"><span class="brand-mark">5</span><span class="brand-name">5PEŇAZÍ</span></div>';
  }

  function glyph(task) {
    return '<span class="task-glyph task-glyph--' + task.tone + '">' + task.icon + "</span>";
  }

  function start() {
    state = freshState();
    state.phase = "active";
    state.plan = shuffled(Object.keys(TASKS)).map(function (id, index) { return { id: id, at: ARRIVAL_SLOTS[index] }; });
    state.studentOrder = shuffled(STUDENTS);
    state.meetingBrief = MEETING_BRIEFS[Math.floor(Math.random() * MEETING_BRIEFS.length)];
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
      if (state.soundOn) notify(true);
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
  }

  function notify(urgent) {
    if (navigator.vibrate) navigator.vibrate(urgent ? [180, 80, 180, 80, 240] : [130, 70, 130]);
    try {
      var context = new AudioContext();
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
    return [
      '<main class="simulation-shell intro-shell">',
      '<header class="brand-bar">', brand(), '<span class="mode-pill">UČITEĽSKÝ REŽIM</span></header>',
      '<section class="welcome-panel"><div class="welcome-bubble"><span class="eyebrow">VITAJ V ZBOROVNI</span>',
      '<h1>Dnes učíš ty.</h1><p>Máš 8 minút na tvorbu testu. Medzitým sleduj školský systém a vybavuj, čo príde.</p></div>',
      '<div class="inbox-preview" aria-label="Ukážka školských upozornení"><div class="preview-topbar"><div><span class="preview-kicker">ŠKOLSKÝ SYSTÉM</span><strong>Prehľad dňa</strong></div><span class="timer-preview">08:00</span></div>',
      '<div class="preview-row"><span class="preview-icon preview-icon--blue">D</span><div><strong>Dochádzka 2.B</strong><p>Čaká na vyplnenie</p></div><span class="status-dot"></span></div>',
      '<div class="preview-row"><span class="preview-icon preview-icon--orange">R</span><div><strong>Správa od rodiča</strong><p>Nová správa</p></div><span class="unread-count">2</span></div></div>',
      '<button class="start-button" data-action="start">Spustiť 8-minútovú simuláciu <span>→</span></button>',
      '<p class="start-note">Pracovný list maj pred sebou. Mobil nechaj odomknutý a zapni si zvuk.</p></section>',
      '<div class="decorative-bubble decorative-bubble--one"></div><div class="decorative-bubble decorative-bubble--two"></div></main>'
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
      '<button class="secondary-button" data-action="restart">Spustiť znova</button></section></main>'
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
    var list = visible.length ? visible.map(renderNotification).join("") : '<div class="quiet-state"><div class="quiet-bubble">…</div><strong>Ticho pred búrkou.</strong><p>Pracuj na papieri. Prvé upozornenie príde čoskoro.</p></div>';
    return [
      '<main class="active-shell"><div class="phone-app"><header class="app-header"><div class="app-header__top">', brand(),
      '<button class="sound-button ', state.soundOn ? "sound-button--on" : "", '" data-action="sound">', state.soundOn ? "ZVUK ON" : "ZVUK OFF", '</button></div>',
      '<div class="timer-row"><div><span class="section-kicker section-kicker--light">ZOSTÁVA</span><strong class="timer ', remaining <= 60 ? "timer--urgent" : "", '">', formatTime(remaining), '</strong></div><div class="agenda-count"><span>', unread, '</span><small>nové</small></div></div>',
      '<div class="progress-track"><span style="width:', progress, '%"></span></div></header>',
      '<section class="dashboard-head"><span class="section-kicker">ŠKOLSKÝ SYSTÉM</span><div class="dashboard-title-row"><div><h1>Prehľad dňa</h1><p>Pokračuj na teste. Systém sa ozve.</p></div><span class="avatar">U</span></div></section>',
      unresolvedMeeting ? '<button class="meeting-reminder" data-open="meeting"><span class="meeting-reminder__burst">!</span><span><strong>Porada práve prebieha</strong><small>Dohodnite sa v zborovni.</small></span><span>→</span></button>' : "",
      '<div class="filter-tabs" aria-label="Filtrovanie agendy">',
      filterButton("all", "Všetko"), filterButton("pending", "Nevybavené"), filterButton("done", "Vybavené"),
      '</div><section class="notification-list" aria-live="polite">', list, '</section>',
      '<nav class="bottom-nav"><button class="bottom-nav__item bottom-nav__item--active" data-filter="all"><span>●</span>Prehľad</button><button class="bottom-nav__item" data-filter="pending"><span>☷</span>Agenda</button><button class="bottom-nav__item" data-filter="done"><span>✓</span>Vybavené</button></nav></div>',
      renderToast(), state.openItem ? renderModal(state.openItem) : "", '</main>'
    ].join("");
  }

  function filterButton(value, label) {
    return '<button class="filter-tab ' + (state.filter === value ? "filter-tab--active" : "") + '" data-filter="' + value + '">' + label + "</button>";
  }

  function renderNotification(item) {
    var task = TASKS[item.id];
    var read = state.read.has(item.id);
    var done = state.resolved.has(item.id);
    return [
      '<button class="notification-row ', !read ? "notification-row--unread" : "", '" data-open="', item.id, '">', glyph(task),
      '<span class="notification-copy"><span class="notification-meta">', task.sender, task.important ? "<em>DÔLEŽITÉ</em>" : "", '</span><strong>', task.title, '</strong><small>', done ? "Vybavené" : task.summary, '</small></span>',
      '<span class="notification-state ', done ? "notification-state--done" : "", '">', done ? "✓" : !read ? "•" : "›", "</span></button>"
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
    return '<div class="task-layer ' + (meeting ? "task-layer--meeting" : "") + '"><div class="task-sheet"><div class="sheet-handle"></div><button class="sheet-close" data-action="close-modal">×</button>' + renderTask(id) + "</div></div>";
  }

  function renderTask(id) {
    if (id === "attendance") {
      return heading(TASKS.attendance) + '<div class="instruction-bubble instruction-bubble--blue">Dnes chýbajú: Kováčová, Molnár, Varga, Horváthová a Baláž.</div><p class="sheet-instruction">Označ presne päť mien a potvrď dochádzku.</p><div class="student-grid">' +
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
        (state.catalogOpen ? '<div class="catalog-results"><span class="section-kicker">VÝSLEDKY V SIMULÁCII</span>' + COURSES.map(function (course) { return '<button data-course="' + esc(course) + '"><span>' + course + '</span><small>online · inovačné vzdelávanie</small></button>'; }).join("") + "</div>" : "") +
        '<label class="field-label" for="course-answer">Názov programu do odpovede</label><input id="course-answer" type="text" value="' + esc(state.principalAnswer) + '" placeholder="Napíš alebo vyber názov">' + error(state.principalError) + '<button class="action-button" data-action="principal">Doplniť a odpovedať</button>';
    }
    if (id === "substitution") {
      var choices = ["Zastúpim a konzultáciu presuniem.", "Nemôžem, mám dohodnutú konzultáciu.", "Zastúpim iba prvých 20 minút."];
      return heading(TASKS.substitution) + '<div class="instruction-bubble instruction-bubble--sand">Kolegyňa ochorela. Potrebujeme zastúpiť fyziku v 4.A na 6. hodine.</div><p class="sheet-instruction">O 14:00 máš konzultáciu s rodičom. Ako odpovieš?</p><div class="choice-stack">' +
        choices.map(function (choice) { return '<button class="choice ' + (state.substitutionAnswer === choice ? "choice--selected" : "") + '" data-choice="' + esc(choice) + '">' + choice + "</button>"; }).join("") +
        '</div><button class="action-button" data-action="substitution"' + (state.substitutionAnswer ? "" : " disabled") + ">Odoslať odpoveď</button>";
    }
    if (id === "colleague") {
      return heading(TASKS.colleague) + '<div class="chat-thread"><div class="chat-bubble">Ahoj, potrebujem si počas veľkej prestávky na päť minút odbehnúť. Postrážiš aj moju časť chodby? Vďaka!</div></div><div class="quick-replies"><button data-resolve="colleague">Áno, postrážim.</button><button data-resolve="colleague">Dnes to nestíham.</button></div>';
    }
    if (id === "student") {
      return heading(TASKS.student) + '<div class="chat-thread"><div class="chat-bubble chat-bubble--student">Dobrý deň, projekt mám hotový, ale zabudol som ho doma. Môžem ho priniesť zajtra bez zníženia známky?</div></div><div class="quick-replies quick-replies--vertical"><button data-resolve="student">Áno, prines ho zajtra.</button><button data-resolve="student">Prines ho zajtra, dohodneme ďalší postup.</button></div>';
    }
    return renderMeeting();
  }

  function renderMeeting() {
    var total = state.meetingBudget.print + state.meetingBudget.lab + state.meetingBudget.mic;
    var options = [["print", "Toner + papier", "potreba 280 €"], ["lab", "Ochranné okuliare", "potreba 300 €"], ["mic", "Bezdrôtový mikrofón", "potreba 295 €"]];
    return [
      '<span class="meeting-label">POSLEDNÁ MINÚTA</span><h2 class="meeting-title">Porada v zborovni</h2>',
      '<p class="meeting-lead">Ako zborovňa sa dohodnite, ako rozdelíte 300 € medzi tri naliehavé potreby.</p>',
      '<div class="personal-brief"><span>INFORMÁCIA PRE PORADU</span><strong>', state.meetingBrief, '</strong></div>',
      '<p class="meeting-instruction">Prečítajte si podklady, diskutujte a na každom mobile zapíšte rovnaké sumy. Spolu musia dať presne 300 €.</p>',
      '<div class="meeting-options">', options.map(function (option) {
        return '<label class="meeting-option"><span><strong>' + option[1] + '</strong><small>' + option[2] + '</small></span><span class="meeting-amount"><input type="number" min="0" max="300" step="5" inputmode="numeric" data-budget="' + option[0] + '" value="' + state.meetingBudget[option[0]] + '"><b>€</b></span></label>';
      }).join(""), '</div>',
      '<div class="meeting-total ', total === 300 ? "meeting-total--ready" : "", '" aria-live="polite"><span>Rozdelené</span><strong id="meeting-total-value">', total, ' / 300 €</strong></div>',
      '<button id="meeting-submit" class="action-button action-button--meeting" data-action="meeting"', total === 300 ? "" : " disabled", '>Potvrdiť spoločné rozdelenie</button>'
    ].join("");
  }

  function error(message) {
    return message ? '<p class="form-error">' + esc(message) + "</p>" : "";
  }

  function render() {
    root.innerHTML = state.phase === "intro" ? renderIntro() : state.phase === "done" ? renderDone() : renderActive();
  }

  root.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.open) return openTask(target.dataset.open);
    if (target.dataset.filter) { state.filter = target.dataset.filter; return render(); }
    if (target.dataset.resolve) return resolveTask(target.dataset.resolve);
    if (target.dataset.course) { state.principalAnswer = target.dataset.course; state.principalError = ""; return render(); }
    if (target.dataset.choice) { state.substitutionAnswer = target.dataset.choice; return render(); }
    var action = target.dataset.action;
    if (action === "start") return start();
    if (action === "restart") { clearInterval(timer); state = freshState(); return render(); }
    if (action === "sound") { state.soundOn = !state.soundOn; return render(); }
    if (action === "close-toast") { state.popup = null; return render(); }
    if (action === "close-modal") { state.openItem = null; return render(); }
    if (action === "catalog") { state.catalogOpen = !state.catalogOpen; return render(); }
    if (action === "attendance") {
      if (state.selectedStudents.length !== 5) state.attendanceError = "Vyber presne 5 mien. Teraz máš označených " + state.selectedStudents.length + ".";
      else {
        var correct = state.selectedStudents.filter(function (name) { return ABSENT.indexOf(name) >= 0; }).length;
        if (correct !== 5) state.attendanceError = "Ešte to nesedí. Správne si označil/a " + correct + " z 5 chýbajúcich.";
        else return resolveTask("attendance");
      }
      return render();
    }
    if (action === "parent") {
      if (state.parentReply.trim().length < 40) { state.parentError = "Odpoveď je príliš krátka. Uznaj obavu, navrhni preverenie a ďalší krok."; return render(); }
      return resolveTask("parent");
    }
    if (action === "principal") {
      if (state.principalAnswer.trim().length < 8) { state.principalError = "Zadaj konkrétny názov vzdelávania."; return render(); }
      return resolveTask("principal");
    }
    if (action === "substitution" && state.substitutionAnswer) return resolveTask("substitution");
    if (action === "meeting") return resolveTask("meeting");
  });

  root.addEventListener("change", function (event) {
    if (event.target.dataset.student) {
      var name = event.target.dataset.student;
      var index = state.selectedStudents.indexOf(name);
      if (index >= 0) state.selectedStudents.splice(index, 1);
      else state.selectedStudents.push(name);
      state.attendanceError = "";
      render();
    }
    if (event.target.dataset.paper !== undefined) {
      state.paperChecks[Number(event.target.dataset.paper)] = event.target.checked;
    }
  });

  root.addEventListener("input", function (event) {
    if (event.target.id === "parent-reply") { state.parentReply = event.target.value; state.parentError = ""; }
    if (event.target.id === "course-answer") { state.principalAnswer = event.target.value; state.principalError = ""; }
    if (event.target.dataset.budget) {
      var value = Math.min(300, Math.max(0, Number(event.target.value) || 0));
      state.meetingBudget[event.target.dataset.budget] = value;
      var total = state.meetingBudget.print + state.meetingBudget.lab + state.meetingBudget.mic;
      var totalBox = root.querySelector(".meeting-total");
      var totalValue = root.querySelector("#meeting-total-value");
      var submit = root.querySelector("#meeting-submit");
      totalValue.textContent = total + " / 300 €";
      totalBox.classList.toggle("meeting-total--ready", total === 300);
      submit.disabled = total !== 300;
    }
  });

  render();
}());
