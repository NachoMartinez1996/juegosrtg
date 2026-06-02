import { fallbackAgenda, fallbackReviews, firebaseConfig } from "./firebase-config.js";

const WHATSAPP_PHONE = "5493413504208";
const FIREBASE_VERSION = "12.14.0";

const state = {
    app: null,
    analytics: null,
    auth: null,
    db: null,
    firestore: null,
    authFns: null,
    user: null,
    firebaseReady: false
};

initViews();
initWhatsappButtons();
initForms();
initFirebase();

function initViews() {
    const views = Array.from(document.querySelectorAll("[data-view]"));
    const links = Array.from(document.querySelectorAll("[data-view-link]"));

    const showView = viewName => {
        const target = views.find(view => view.dataset.view === viewName) || views[0];
        if (!target) return;

        views.forEach(view => {
            view.classList.toggle("is-active", view === target);
        });

        links.forEach(link => {
            link.classList.toggle("is-active", link.dataset.viewLink === target.dataset.view);
        });

        document.body.dataset.currentView = target.dataset.view;
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    links.forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            const viewName = link.dataset.viewLink;
            history.pushState(null, "", `#${viewName}`);
            showView(viewName);
        });
    });

    window.addEventListener("popstate", () => {
        showView(getHashView());
    });

    showView(getHashView());
}

function getHashView() {
    return window.location.hash.replace("#", "") || "inicio";
}

function initWhatsappButtons() {
    document.querySelectorAll("[data-whatsapp-tour]").forEach(button => {
        button.addEventListener("click", () => {
            const tour = button.dataset.whatsappTour;
            openWhatsapp(`Hola Ignacio, quiero consultar por el recorrido "${tour}".`);
        });
    });
}

function initForms() {
    const bookingForm = document.getElementById("booking-form");
    const suggestionForm = document.getElementById("suggestion-form");
    const reviewForm = document.getElementById("review-form");

    bookingForm?.addEventListener("submit", handleBookingSubmit);
    suggestionForm?.addEventListener("submit", handleSuggestionSubmit);
    reviewForm?.addEventListener("submit", handleReviewSubmit);

    document.getElementById("register-user-btn")?.addEventListener("click", handleRegister);
    document.getElementById("login-user-btn")?.addEventListener("click", handleLogin);
    document.getElementById("logout-user-btn")?.addEventListener("click", () => {
        state.authFns?.signOut(state.auth);
    });
}

async function initFirebase() {
    try {
        const [appMod, analyticsMod, authMod, firestoreMod] = await Promise.all([
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-analytics.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
        ]);

        state.app = appMod.initializeApp(firebaseConfig);
        state.auth = authMod.getAuth(state.app);
        state.db = firestoreMod.getFirestore(state.app);
        state.firestore = firestoreMod;
        state.authFns = authMod;
        state.firebaseReady = true;

        analyticsMod.isSupported()
            .then(supported => {
                if (supported) state.analytics = analyticsMod.getAnalytics(state.app);
            })
            .catch(() => {});

        authMod.onAuthStateChanged(state.auth, user => {
            state.user = user;
            updateAuthUI(user);
        });

        subscribeAgenda();
        subscribeReviews();
        loadPaymentConfig();
    } catch (error) {
        console.warn("Firebase no está disponible. La página conserva las funciones públicas.", error);
        renderAgenda(fallbackAgenda);
        renderReviews(fallbackReviews);
        setText("auth-status", "Firebase no está disponible ahora. Podés seguir consultando por WhatsApp.");
    }
}

async function handleBookingSubmit(event) {
    event.preventDefault();

    const feedback = document.getElementById("form-feedback");
    const payload = {
        name: getValue("booking-name"),
        email: getValue("booking-email"),
        phone: getValue("booking-phone"),
        tour: getValue("booking-tour"),
        date: getValue("booking-date") || "A coordinar",
        people: getValue("booking-people"),
        duration: getValue("booking-duration"),
        message: getValue("booking-message"),
        uid: state.user?.uid || null
    };

    if (!payload.name || !payload.email || !payload.phone || !payload.tour) {
        feedback.textContent = "Completá nombre, email, WhatsApp y recorrido.";
        return;
    }

    if (state.firebaseReady) {
        try {
            await state.firestore.addDoc(state.firestore.collection(state.db, "registrations"), {
                ...payload,
                status: "pending",
                createdAt: state.firestore.serverTimestamp()
            });
        } catch (error) {
            console.warn("No se pudo guardar la inscripción en Firebase.", error);
        }
    }

    const lines = [
        `Hola Ignacio, soy ${payload.name}.`,
        `Quiero inscribirme al recorrido "${payload.tour}".`,
        `Fecha tentativa: ${payload.date}.`,
        `Cantidad de personas: ${payload.people}.`,
        `Duración / precio: ${payload.duration}.`,
        `Email: ${payload.email}.`,
        `WhatsApp: ${payload.phone}.`,
        payload.message ? `Mensaje: ${payload.message}` : "",
        "Entiendo que las salidas son en espacios públicos y no son privadas."
    ].filter(Boolean);

    feedback.textContent = "Abriendo WhatsApp con tu inscripción...";
    openWhatsapp(lines.join("\n"));
}

async function handleSuggestionSubmit(event) {
    event.preventDefault();

    const feedback = document.getElementById("suggestion-feedback");
    const payload = {
        name: getValue("suggestion-name"),
        contact: getValue("suggestion-contact"),
        text: getValue("suggestion-text"),
        uid: state.user?.uid || null
    };

    if (!payload.name || !payload.contact || !payload.text) {
        feedback.textContent = "Completá todos los campos para enviar la sugerencia.";
        return;
    }

    if (!state.firebaseReady) {
        feedback.textContent = "Firebase no está disponible. También podés enviarla por WhatsApp.";
        openWhatsapp(`Hola Ignacio, quiero sugerir un recorrido: ${payload.text}`);
        return;
    }

    try {
        await state.firestore.addDoc(state.firestore.collection(state.db, "suggestions"), {
            ...payload,
            status: "new",
            createdAt: state.firestore.serverTimestamp()
        });
        event.target.reset();
        feedback.textContent = "Sugerencia enviada. Gracias por sumar ideas.";
    } catch (error) {
        feedback.textContent = "No se pudo enviar. Probá por WhatsApp.";
    }
}

async function handleReviewSubmit(event) {
    event.preventDefault();

    const feedback = document.getElementById("review-feedback");

    if (!state.user) {
        feedback.textContent = "Ingresá o registrate para dejar una reseña.";
        return;
    }

    if (!state.firebaseReady) {
        feedback.textContent = "Firebase no está disponible ahora.";
        return;
    }

    const text = getValue("review-text");
    if (!text) {
        feedback.textContent = "Escribí tu reseña antes de enviarla.";
        return;
    }

    try {
        await state.firestore.addDoc(state.firestore.collection(state.db, "reviews"), {
            uid: state.user.uid,
            name: state.user.displayName || state.user.email,
            stars: Number(getValue("review-stars")),
            text,
            approved: false,
            createdAt: state.firestore.serverTimestamp()
        });
        event.target.reset();
        feedback.textContent = "Reseña enviada. Queda pendiente de aprobación.";
    } catch (error) {
        feedback.textContent = "No se pudo guardar la reseña.";
    }
}

async function handleRegister() {
    const feedback = document.getElementById("auth-status");

    if (!state.firebaseReady) {
        feedback.textContent = "Firebase no está disponible ahora.";
        return;
    }

    const name = getValue("auth-name");
    const email = getValue("auth-email");
    const password = getValue("auth-password");

    if (!name || !email || !password) {
        feedback.textContent = "Completá nombre, email y contraseña.";
        return;
    }

    try {
        const credential = await state.authFns.createUserWithEmailAndPassword(state.auth, email, password);
        await state.authFns.updateProfile(credential.user, { displayName: name });
        await state.firestore.setDoc(state.firestore.doc(state.db, "users", credential.user.uid), {
            name,
            email,
            createdAt: state.firestore.serverTimestamp()
        });
        feedback.textContent = "Cuenta creada. Ya podés dejar reseñas.";
    } catch (error) {
        feedback.textContent = getFirebaseMessage(error);
    }
}

async function handleLogin() {
    const feedback = document.getElementById("auth-status");

    if (!state.firebaseReady) {
        feedback.textContent = "Firebase no está disponible ahora.";
        return;
    }

    try {
        await state.authFns.signInWithEmailAndPassword(state.auth, getValue("auth-email"), getValue("auth-password"));
        feedback.textContent = "Sesión iniciada.";
    } catch (error) {
        feedback.textContent = getFirebaseMessage(error);
    }
}

function updateAuthUI(user) {
    const status = document.getElementById("auth-status");
    const logout = document.getElementById("logout-user-btn");
    const login = document.getElementById("login-user-btn");
    const register = document.getElementById("register-user-btn");

    if (!status) return;

    if (user) {
        status.textContent = `Sesión iniciada como ${user.displayName || user.email}.`;
        logout.hidden = false;
        login.hidden = true;
        register.hidden = true;
    } else {
        status.textContent = "Creá una cuenta para dejar reseñas asociadas a tu usuario.";
        logout.hidden = true;
        login.hidden = false;
        register.hidden = false;
    }
}

function subscribeAgenda() {
    const { collection, onSnapshot, orderBy, query } = state.firestore;
    const agendaQuery = query(collection(state.db, "agenda"), orderBy("date", "asc"));

    onSnapshot(agendaQuery, snapshot => {
        const items = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(item => item.published !== false);
        renderAgenda(items.length ? items : fallbackAgenda);
    }, () => renderAgenda(fallbackAgenda));
}

function subscribeReviews() {
    const { collection, onSnapshot, orderBy, query } = state.firestore;
    const reviewsQuery = query(collection(state.db, "reviews"), orderBy("createdAt", "desc"));

    onSnapshot(reviewsQuery, snapshot => {
        const items = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(item => item.approved === true);
        renderReviews(items.length ? items : fallbackReviews);
    }, () => renderReviews(fallbackReviews));
}

async function loadPaymentConfig() {
    try {
        const paymentRef = state.firestore.doc(state.db, "siteConfig", "payment");
        const snap = await state.firestore.getDoc(paymentRef);
        if (!snap.exists()) return;
        const payment = snap.data();

        if (payment.details) setText("payment-details", payment.details);
        if (payment.link) {
            const link = document.getElementById("payment-link");
            link.href = payment.link;
            link.textContent = payment.label || "Abonar seña";
        }
    } catch (error) {
        console.warn("No se pudo leer configuración de seña.", error);
    }
}

function renderAgenda(items) {
    const list = document.getElementById("agenda-list");
    if (!list) return;

    list.innerHTML = items.map(item => `
        <article class="agenda-card">
            <strong>${escapeHtml(item.tour || "Salida guiada")}</strong>
            <span>${escapeHtml(formatAgendaDate(item.date))} · ${escapeHtml(item.time || "Horario a confirmar")}</span>
            <span>${escapeHtml(item.duration || "Duración a completar")} · ${escapeHtml(item.price || "Precio según duración")}</span>
            <span>${escapeHtml(item.meeting || "Punto de encuentro a confirmar")}</span>
            <em>${escapeHtml(item.capacity || item.spots || "Cupos a confirmar")}</em>
        </article>
    `).join("");
}

function renderReviews(items) {
    const list = document.getElementById("reviews-list");
    if (!list) return;

    list.innerHTML = items.map(item => `
        <article class="review-card">
            <strong>${"★".repeat(Number(item.stars || 5))}${"☆".repeat(5 - Number(item.stars || 5))}</strong>
            <p>${escapeHtml(item.text || "")}</p>
            <span>${escapeHtml(item.name || "Visitante")}</span>
        </article>
    `).join("");
}

function openWhatsapp(message) {
    const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");
}

function getValue(id) {
    return document.getElementById(id)?.value.trim() || "";
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
}

function formatAgendaDate(value) {
    if (!value || value === "A definir") return "Fecha a confirmar";
    return value;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getFirebaseMessage(error) {
    const code = error?.code || "";
    if (code.includes("auth/email-already-in-use")) return "Ese email ya está registrado.";
    if (code.includes("auth/invalid-credential")) return "Email o contraseña incorrectos.";
    if (code.includes("auth/weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
    if (code.includes("auth/operation-not-allowed")) return "Activá Email/Password en Firebase Authentication.";
    return "No se pudo completar la operación.";
}
