/* Élevage Poulets – application mobile hors-ligne
   Toutes les données sont stockées dans le téléphone (localStorage). */
"use strict";

const DEVISE = "FCFA";
const CATEGORIES = ["Aliment", "Vaccin", "Médicament", "Litière", "Main d'œuvre",
  "Électricité / Eau", "Transport", "Chauffage / Gaz", "Autre"];
const CAUSES = ["Inconnue", "Maladie", "Chaleur", "Froid", "Étouffement", "Prédateur", "Accident", "Autre"];
const KEY = "elevage-poulets-v1";

/* ------------------------------------------------------------ Données */
let DB = load();
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { lots: [] }; }
  catch (e) { return { lots: [] }; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const getLot = id => DB.lots.find(l => l.id === id);

/* ------------------------------------------------------------ Outils */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
// espaces insécables : un montant n'est jamais coupé en fin de ligne
const argent = x => Math.round(x).toLocaleString("fr-FR").replace(/[   ]/g, " ") + " " + DEVISE;
const pct = x => x.toFixed(1).replace(".", ",") + " %";
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const jours = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const fmtD = s => s ? s.split("-").reverse().join("/") : "";
const fmtDC = s => s ? s.split("-").reverse().slice(0, 2).join("/") : "";
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200);
}

/* ------------------------------------------------------------ Calculs */
function calculer(lot) {
  const s = {};
  const today = todayISO();
  s.cout_poussins = lot.nb_poussins * lot.prix_poussin;
  s.par_cat = {};
  for (const d of lot.depenses) s.par_cat[d.categorie] = (s.par_cat[d.categorie] || 0) + d.quantite * d.prix_unitaire;
  s.total_depenses = Object.values(s.par_cat).reduce((a, b) => a + b, 0);
  s.cout_total = s.cout_poussins + s.total_depenses;

  s.morts = lot.mortalites.reduce((a, m) => a + m.nombre, 0);
  s.vendus = lot.ventes.reduce((a, v) => a + v.quantite, 0);
  s.vivants = lot.nb_poussins - s.morts - s.vendus;
  s.taux_mortalite = lot.nb_poussins ? 100 * s.morts / lot.nb_poussins : 0;
  s.age = jours(lot.date_debut, today);
  s.jours_restants = lot.duree_jours - s.age;

  s.recettes = lot.ventes.reduce((a, v) => a + v.quantite * v.prix_unitaire, 0);
  s.prix_moyen = s.vendus ? s.recettes / s.vendus : 0;
  s.recette_restante = Math.max(s.vivants, 0) * lot.prix_vente_prevu;
  s.recette_prevue = s.recettes + s.recette_restante;
  s.resultat_reel = s.recettes - s.cout_total;
  s.resultat_prevu = s.recette_prevue - s.cout_total;
  s.marge = s.recette_prevue ? 100 * s.resultat_prevu / s.recette_prevue : 0;
  const utiles = s.vivants + s.vendus;
  s.cout_revient = utiles > 0 ? s.cout_total / utiles : 0;
  s.prix_seuil = s.vivants > 0 ? (s.cout_total - s.recettes) / s.vivants : 0;
  s.perte_mort = s.morts * lot.prix_poussin + (lot.nb_poussins ? s.morts * s.total_depenses / lot.nb_poussins : 0);
  s.manque = s.morts * lot.prix_vente_prevu;

  // Alertes
  const a = [];
  if (s.vivants < 0) a.push(["danger", "Incohérence : morts + vendus dépassent le nombre de poussins achetés."]);
  if (s.resultat_prevu < 0) {
    let m = `PERTE PRÉVISIONNELLE de ${argent(-s.resultat_prevu)} au prix prévu de ${argent(lot.prix_vente_prevu)}/poulet.`;
    if (s.vivants > 0) m += ` Vendez les ${s.vivants} poulets restants au minimum à ${argent(s.prix_seuil)} pièce pour équilibrer.`;
    a.push(["danger", m]);
  } else if (s.recette_prevue > 0 && s.marge < lot.marge_cible) {
    a.push(["warning", `Marge prévisionnelle faible : ${pct(s.marge)} (objectif ${lot.marge_cible} %).`]);
  }
  if (s.taux_mortalite >= lot.seuil_mortalite)
    a.push(["danger", `Mortalité élevée : ${pct(s.taux_mortalite)} (seuil ${lot.seuil_mortalite} %). Coût perdu ≈ ${argent(s.perte_mort)}, manque à gagner ≈ ${argent(s.manque)}.`]);
  const recents = lot.mortalites.filter(m => jours(m.date, today) <= 3).reduce((x, m) => x + m.nombre, 0);
  if (recents > 0 && recents >= 0.01 * lot.nb_poussins)
    a.push(["warning", `${recents} morts sur les 3 derniers jours : surveillez l'état sanitaire (vétérinaire ?).`]);
  for (const v of lot.ventes)
    if (s.cout_revient && v.prix_unitaire < s.cout_revient)
      a.push(["warning", `Vente du ${fmtD(v.date)} à ${argent(v.prix_unitaire)} : sous le coût de revient (${argent(s.cout_revient)}).`]);
  if (lot.statut === "En cours" && s.jours_restants < 0 && s.vivants > 0)
    a.push(["warning", `Le lot dépasse la durée prévue de ${-s.jours_restants} jour(s) : chaque jour coûte de l'aliment en plus.`]);
  if (lot.statut === "En cours" && s.age >= 7 && !lot.depenses.some(d => d.categorie === "Vaccin"))
    a.push(["info", "Aucun vaccin enregistré pour ce lot."]);
  s.alertes = a;
  s.nb_danger = a.filter(x => x[0] === "danger").length;
  s.nb_warning = a.filter(x => x[0] === "warning").length;
  return s;
}

/* ------------------------------------------------------------ Rendu */
const kpi = (lbl, val, cls = "") => `<div class="kpi"><div class="lbl">${lbl}</div><div class="val ${cls}">${val}</div></div>`;
const cls = x => x < 0 ? "neg" : "pos";
const badges = s => (s.nb_danger ? `<span class="badge b-danger">⚠ ${s.nb_danger}</span> ` : "") +
  (s.nb_warning ? `<span class="badge b-warning">${s.nb_warning}</span>` : "") +
  (!s.nb_danger && !s.nb_warning ? `<span class="badge b-ok">OK</span>` : "");

function viewHome() {
  setTitle("🐔 Élevage Poulets");
  if (!DB.lots.length) return `<div class="empty"><div class="big">🐣</div>
    <p>Aucun lot pour l'instant.</p><a class="btn" href="#/lot/new">Créer mon premier lot</a></div>`;
  const data = DB.lots.slice().sort((a, b) => b.date_debut.localeCompare(a.date_debut)).map(l => [l, calculer(l)]);
  const enCours = data.filter(([l]) => l.statut === "En cours");
  const sum = k => data.reduce((a, [, s]) => a + s[k], 0);
  const resPrevu = sum("resultat_prevu");
  return `
    <div class="grid" style="margin-bottom:12px">
      ${kpi("Lots en cours", enCours.length)}
      ${kpi("Poulets vivants", enCours.reduce((a, [, s]) => a + Math.max(s.vivants, 0), 0))}
      ${kpi("Coût total", argent(sum("cout_total")))}
      ${kpi("Recettes", argent(sum("recettes")))}
      ${kpi("Résultat prévu", argent(resPrevu), cls(resPrevu))}
      ${kpi("Alertes graves", sum("nb_danger"), sum("nb_danger") ? "neg" : "pos")}
    </div>
    ${data.map(([l, s]) => `
      <a class="card lot-card" href="#/lot/${l.id}">
        <div class="head">
          <div><div class="name">${esc(l.nom)}</div>
            <div class="muted">${fmtD(l.date_debut)} · J${s.age} · ${l.nb_poussins} poussins
              ${l.statut !== "En cours" ? '· <span class="badge b-grey">Clôturé</span>' : ""}</div></div>
          <div>${badges(s)}</div>
        </div>
        <div class="mini">
          <div>Vivants<b>${s.vivants}</b></div>
          <div>Mortalité<b class="${s.taux_mortalite >= l.seuil_mortalite ? "neg" : ""}">${pct(s.taux_mortalite)}</b></div>
          <div>Résultat prévu<b class="${cls(s.resultat_prevu)}">${argent(s.resultat_prevu)}</b></div>
        </div>
      </a>`).join("")}`;
}

function viewLotForm(id) {
  const l = id ? getLot(id) : null;
  if (id && !l) return notFound();
  setTitle(l ? "Modifier le lot" : "Nouveau lot", true);
  const v = (k, d = "") => esc(l ? l[k] : d);
  return `<form id="f-lot" class="card">
    <h2>Achat des poussins</h2>
    <label>Nom du lot *</label><input name="nom" required value="${v("nom", "Bande " + todayISO().slice(5, 7) + "/" + todayISO().slice(0, 4))}">
    <div class="row">
      <div><label>Date d'arrivée *</label><input type="date" name="date_debut" required value="${v("date_debut", todayISO())}"></div>
      <div><label>Statut</label><select name="statut">${["En cours", "Clôturé"].map(x => `<option ${l && l.statut === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div><label>Nombre de poussins *</label><input type="number" inputmode="numeric" min="1" name="nb_poussins" required value="${v("nb_poussins")}"></div>
      <div><label>Prix d'un poussin *</label><input type="number" inputmode="decimal" step="any" min="0" name="prix_poussin" required value="${v("prix_poussin")}"></div>
      <div><label>Fournisseur</label><input name="fournisseur" value="${v("fournisseur")}"></div>
      <div><label>Souche / race</label><input name="souche" placeholder="Cobb 500…" value="${v("souche")}"></div>
    </div>
    <h2 style="margin-top:16px">Objectifs et alertes</h2>
    <div class="row">
      <div><label>Prix de vente prévu / poulet *</label><input type="number" inputmode="decimal" step="any" min="0" name="prix_vente_prevu" required value="${v("prix_vente_prevu")}"></div>
      <div><label>Durée d'élevage (jours)</label><input type="number" inputmode="numeric" name="duree_jours" value="${v("duree_jours", 45)}"></div>
      <div><label>Seuil mortalité (%)</label><input type="number" inputmode="decimal" step="any" name="seuil_mortalite" value="${v("seuil_mortalite", 5)}"></div>
      <div><label>Marge minimale (%)</label><input type="number" inputmode="decimal" step="any" name="marge_cible" value="${v("marge_cible", 15)}"></div>
    </div>
    <label>Notes</label><textarea name="notes" rows="2">${v("notes")}</textarea>
    <button class="btn">Enregistrer</button>
    ${l ? `<button type="button" class="btn danger" id="del-lot">Supprimer ce lot</button>` : ""}
  </form>`;
}

let currentTab = "bilan";
function viewLot(id) {
  const l = getLot(id);
  if (!l) return notFound();
  setTitle(l.nom, true);
  const s = calculer(l);
  const tab = (k, lbl) => `<button data-tab="${k}" class="${currentTab === k ? "active" : ""}">${lbl}</button>`;
  return `
    <div class="muted" style="margin-bottom:8px">Arrivée le ${fmtD(l.date_debut)} · J${s.age}/${l.duree_jours} ·
      ${l.nb_poussins} poussins à ${argent(l.prix_poussin)}${l.souche ? " · " + esc(l.souche) : ""}${l.fournisseur ? " · " + esc(l.fournisseur) : ""}
      ${l.statut !== "En cours" ? ' · <span class="badge b-grey">Clôturé</span>' : ""}</div>
    ${s.alertes.map(([n, m]) => `<div class="alert ${n}">${n === "info" ? "ℹ️" : "⚠️"} ${esc(m)}</div>`).join("")}
    <div class="grid" style="margin:10px 0">
      ${kpi("Vivants", s.vivants)}
      ${kpi("Morts", `${s.morts} (${pct(s.taux_mortalite)})`, s.taux_mortalite >= l.seuil_mortalite ? "neg" : "")}
      ${kpi("Coût total", argent(s.cout_total))}
      ${kpi("Coût revient / poulet", argent(s.cout_revient))}
      ${kpi("Recettes encaissées", argent(s.recettes))}
      ${kpi("Résultat prévu", argent(s.resultat_prevu), cls(s.resultat_prevu))}
    </div>
    <div class="tabs">${tab("bilan", "Bilan")}${tab("dep", `Dépenses (${l.depenses.length})`)}${tab("mort", `Morts (${s.morts})`)}${tab("vente", `Ventes (${s.vendus})`)}</div>
    <div id="tab">${renderTab(l, s)}</div>
    <div class="btn-row">
      <a class="btn secondary" href="#/lot/${l.id}/edit">✏️ Modifier</a>
      <button class="btn secondary" id="csv">📄 Export CSV</button>
    </div>`;
}

function renderTab(l, s) {
  const dateIn = `<input type="date" name="date" value="${todayISO()}" required>`;
  if (currentTab === "bilan") return `<div class="card"><table class="bilan">
      <tr><td>Achat poussins</td><td>${argent(s.cout_poussins)}</td></tr>
      ${Object.entries(s.par_cat).map(([c, m]) => `<tr><td>${esc(c)}</td><td>${argent(m)}</td></tr>`).join("")}
      <tr class="tot"><td>Total des charges</td><td>${argent(s.cout_total)}</td></tr>
      <tr><td>Recettes encaissées (${s.vendus} poulets${s.vendus ? ", moy. " + argent(s.prix_moyen) : ""})</td><td>${argent(s.recettes)}</td></tr>
      <tr><td>Recettes à venir (${Math.max(s.vivants, 0)} × ${argent(l.prix_vente_prevu)})</td><td>${argent(s.recette_restante)}</td></tr>
      <tr class="tot"><td>Recette totale prévue</td><td>${argent(s.recette_prevue)}</td></tr>
      <tr class="tot"><td>Bénéfice / perte prévu</td><td class="${cls(s.resultat_prevu)}">${argent(s.resultat_prevu)} (${pct(s.marge)})</td></tr>
      <tr><td>Résultat actuel (encaissé − dépensé)</td><td class="${cls(s.resultat_reel)}">${argent(s.resultat_reel)}</td></tr>
      <tr><td>Prix minimum de vente des restants</td><td>${s.vivants > 0 ? argent(s.prix_seuil) : "—"}</td></tr>
      <tr><td>Coût perdu (mortalités)</td><td class="neg">${argent(s.perte_mort)}</td></tr>
      <tr><td>Manque à gagner (mortalités)</td><td class="neg">${argent(s.manque)}</td></tr>
    </table></div>`;

  if (currentTab === "dep") return `
    <form class="card" data-add="depenses"><h2>Ajouter une dépense</h2>
      <div class="row">
        <div><label>Date</label>${dateIn}</div>
        <div><label>Catégorie</label><select name="categorie">${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
      </div>
      <label>Description</label><input name="description" placeholder="Aliment démarrage, Gumboro…">
      <div class="row">
        <div><label>Quantité</label><input type="number" inputmode="decimal" step="any" name="quantite" value="1"></div>
        <div><label>Unité</label><input name="unite" placeholder="sac, dose…"></div>
      </div>
      <label>Prix unitaire (${DEVISE}) *</label><input type="number" inputmode="decimal" step="any" min="0" name="prix_unitaire" required>
      <button class="btn">Ajouter la dépense</button>
    </form>
    <div class="card"><ul class="list">${l.depenses.slice().sort((a, b) => b.date.localeCompare(a.date)).map(d => `
      <li><div class="main"><b>${esc(d.categorie)}</b> ${esc(d.description)}<div class="muted">${fmtDC(d.date)} · ${d.quantite} ${esc(d.unite)} × ${argent(d.prix_unitaire)}</div></div>
        <span class="amount">${argent(d.quantite * d.prix_unitaire)}</span><button class="del" data-del="depenses" data-id="${d.id}">✕</button></li>`).join("") || '<li class="muted">Aucune dépense.</li>'}</ul></div>`;

  if (currentTab === "mort") return `
    <form class="card" data-add="mortalites"><h2>Enregistrer des morts</h2>
      <div class="row">
        <div><label>Date</label>${dateIn}</div>
        <div><label>Nombre *</label><input type="number" inputmode="numeric" min="1" name="nombre" required></div>
      </div>
      <label>Cause</label><select name="cause">${CAUSES.map(c => `<option>${c}</option>`).join("")}</select>
      <label>Observation / symptômes</label><input name="observation">
      <button class="btn warn">Enregistrer</button>
    </form>
    <div class="card"><ul class="list">${l.mortalites.slice().sort((a, b) => b.date.localeCompare(a.date)).map(m => `
      <li><div class="main"><b>${m.nombre} mort(s)</b> · ${esc(m.cause)}<div class="muted">${fmtDC(m.date)} · J${jours(l.date_debut, m.date)} ${m.observation ? "· " + esc(m.observation) : ""}</div></div>
        <button class="del" data-del="mortalites" data-id="${m.id}">✕</button></li>`).join("") || '<li class="muted">Aucune mortalité.</li>'}</ul></div>`;

  return `
    <form class="card" data-add="ventes"><h2>Enregistrer une vente</h2>
      <div class="row">
        <div><label>Date</label>${dateIn}</div>
        <div><label>Client</label><input name="client"></div>
        <div><label>Nombre de poulets *</label><input type="number" inputmode="numeric" min="1" name="quantite" required></div>
        <div><label>Prix / poulet *</label><input type="number" inputmode="decimal" step="any" min="0" name="prix_unitaire" required value="${l.prix_vente_prevu}"></div>
      </div>
      <button class="btn">Enregistrer la vente</button>
    </form>
    <div class="card"><ul class="list">${l.ventes.slice().sort((a, b) => b.date.localeCompare(a.date)).map(v => `
      <li><div class="main"><b>${v.quantite} poulets</b> ${v.client ? "· " + esc(v.client) : ""}<div class="muted">${fmtDC(v.date)} · <span class="${s.cout_revient && v.prix_unitaire < s.cout_revient ? "neg" : ""}">${argent(v.prix_unitaire)}</span> / poulet</div></div>
        <span class="amount">${argent(v.quantite * v.prix_unitaire)}</span><button class="del" data-del="ventes" data-id="${v.id}">✕</button></li>`).join("") || '<li class="muted">Aucune vente.</li>'}</ul></div>`;
}

function viewBackup() {
  setTitle("💾 Sauvegarde");
  const n = DB.lots.length;
  return `<div class="card"><h2>Vos données</h2>
      <p class="muted">Les données sont enregistrées <b>uniquement dans ce téléphone</b> (${n} lot${n > 1 ? "s" : ""}).
      Si vous désinstallez l'application, videz les données de Chrome ou perdez le téléphone, elles disparaissent.
      Faites une sauvegarde régulièrement (par exemple chaque semaine) et envoyez-la-vous par WhatsApp ou e-mail.</p>
      <button class="btn" id="exp">📤 Sauvegarder / partager mes données</button>
      <label for="imp" class="btn secondary">📥 Restaurer une sauvegarde</label>
      <input type="file" id="imp" accept=".json,application/json" hidden>
      <p class="muted">${DB.last_backup ? "Dernière sauvegarde : " + fmtD(DB.last_backup) : "Aucune sauvegarde faite pour l'instant."}</p>
    </div>
    <details class="card"><summary>Comment sont faits les calculs ?</summary>
      <ul class="muted">
        <li><b>Coût total</b> = poussins + toutes les dépenses</li>
        <li><b>Vivants</b> = poussins − morts − vendus</li>
        <li><b>Coût de revient</b> = coût total ÷ (vivants + vendus)</li>
        <li><b>Résultat prévu</b> = ventes encaissées + vivants × prix prévu − coût total</li>
        <li><b>Prix minimum</b> = (coût total − ventes encaissées) ÷ vivants</li>
      </ul></details>`;
}

const notFound = () => `<div class="empty"><p>Lot introuvable.</p><a class="btn" href="#/">Retour</a></div>`;
function setTitle(t, back = false) { $("#title").textContent = t; $("#btn-back").hidden = !back; }

/* ------------------------------------------------------------ Routeur */
function route() {
  const h = location.hash.replace(/^#/, "") || "/";
  const p = h.split("/").filter(Boolean);
  let html, nav = "home";
  if (p[0] === "lot" && p[1] === "new") { html = viewLotForm(); nav = "new"; }
  else if (p[0] === "lot" && p[2] === "edit") html = viewLotForm(p[1]);
  else if (p[0] === "lot") html = viewLot(p[1]);
  else if (p[0] === "backup") { html = viewBackup(); nav = "backup"; }
  else html = viewHome();
  $("#app").innerHTML = html;
  document.querySelectorAll(".bottomnav a").forEach(a => a.classList.toggle("active", a.dataset.nav === nav));
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { currentTab = "bilan"; route(); });
$("#btn-back").addEventListener("click", () => {
  const p = location.hash.split("/");
  location.hash = p[3] === "edit" ? `#/lot/${p[2]}` : "#/";
});

/* ------------------------------------------------------------ Actions */
document.addEventListener("submit", e => {
  const f = e.target; e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  if (f.id === "f-lot") {
    const id = location.hash.split("/")[2];
    let l = id && id !== "new" ? getLot(id) : null;
    if (!l) { l = { id: uid(), depenses: [], mortalites: [], ventes: [] }; DB.lots.push(l); }
    Object.assign(l, {
      nom: d.nom.trim(), date_debut: d.date_debut, statut: d.statut, nb_poussins: Math.round(num(d.nb_poussins)),
      prix_poussin: num(d.prix_poussin), fournisseur: d.fournisseur.trim(), souche: d.souche.trim(),
      prix_vente_prevu: num(d.prix_vente_prevu), duree_jours: Math.round(num(d.duree_jours)) || 45,
      seuil_mortalite: d.seuil_mortalite === "" ? 5 : num(d.seuil_mortalite),
      marge_cible: d.marge_cible === "" ? 15 : num(d.marge_cible), notes: d.notes
    });
    save(); toast("Lot enregistré"); location.hash = `#/lot/${l.id}`; return;
  }
  const kind = f.dataset.add;
  if (kind) {
    const l = getLot(location.hash.split("/")[2]);
    let item = { id: uid(), date: d.date };
    if (kind === "depenses") Object.assign(item, { categorie: d.categorie, description: d.description.trim(), quantite: num(d.quantite) || 1, unite: d.unite.trim(), prix_unitaire: num(d.prix_unitaire) });
    if (kind === "mortalites") Object.assign(item, { nombre: Math.round(num(d.nombre)), cause: d.cause, observation: d.observation.trim() });
    if (kind === "ventes") {
      const s = calculer(l), q = Math.round(num(d.quantite));
      if (q > s.vivants && !confirm(`Il ne reste que ${s.vivants} poulets vivants. Enregistrer quand même ${q} ?`)) return;
      Object.assign(item, { client: d.client.trim(), quantite: q, prix_unitaire: num(d.prix_unitaire) });
    }
    l[kind].push(item); save();
    toast({ depenses: "Dépense ajoutée", mortalites: "Mortalité enregistrée", ventes: "Vente enregistrée" }[kind]);
    route();
  }
});

document.addEventListener("click", e => {
  const t = e.target.closest("button, [data-tab]"); if (!t) return;
  if (t.dataset.tab) { currentTab = t.dataset.tab; route(); return; }
  if (t.dataset.del) {
    if (!confirm("Supprimer cette ligne ?")) return;
    const l = getLot(location.hash.split("/")[2]);
    l[t.dataset.del] = l[t.dataset.del].filter(x => x.id !== t.dataset.id); save(); route(); return;
  }
  if (t.id === "del-lot") {
    if (!confirm("Supprimer définitivement ce lot et toutes ses données ?")) return;
    DB.lots = DB.lots.filter(x => x.id !== location.hash.split("/")[2]); save(); toast("Lot supprimé"); location.hash = "#/"; return;
  }
  if (t.id === "csv") exportCSV(getLot(location.hash.split("/")[2]));
  if (t.id === "exp") exportJSON();
});

document.addEventListener("change", e => {
  if (e.target.id !== "imp" || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data.lots)) throw new Error();
      if (!confirm(`Remplacer les données actuelles par cette sauvegarde (${data.lots.length} lots) ?`)) return;
      DB = data; save(); toast("Sauvegarde restaurée"); location.hash = "#/"; route();
    } catch (err) { alert("Fichier de sauvegarde invalide."); }
  };
  r.readAsText(e.target.files[0]);
});

const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function shareOrDownload(content, name, type) {
  if (NATIVE) {  // Application APK : écrire le fichier puis ouvrir le menu Partager d'Android
    try {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const r = await Filesystem.writeFile({ path: name, data: content, directory: "CACHE", encoding: "utf8" });
      await Share.share({ title: name, files: [r.uri], dialogTitle: "Envoyer " + name });
      return true;
    } catch (err) {
      if (!/cancel/i.test(String(err && err.message))) alert("Partage impossible : " + (err && err.message || err));
      return false;
    }
  }
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (err) { if (err.name === "AbortError") return false; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}
async function exportJSON() {
  DB.last_backup = todayISO(); save();
  await shareOrDownload(JSON.stringify(DB, null, 1), `sauvegarde-poulets-${todayISO()}.json`, "application/json");
  route();
}
function exportCSV(l) {
  const s = calculer(l), q = x => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const rows = [["Type", "Date", "Catégorie/Client/Cause", "Description", "Quantité", "Prix unitaire", "Montant"],
    ["Achat poussins", l.date_debut, l.fournisseur, l.souche, l.nb_poussins, l.prix_poussin, s.cout_poussins],
    ...l.depenses.map(d => ["Dépense", d.date, d.categorie, d.description, d.quantite, d.prix_unitaire, d.quantite * d.prix_unitaire]),
    ...l.mortalites.map(m => ["Mortalité", m.date, m.cause, m.observation, m.nombre, "", ""]),
    ...l.ventes.map(v => ["Vente", v.date, v.client, "", v.quantite, v.prix_unitaire, v.quantite * v.prix_unitaire]),
    [], ["Synthèse", "", "Coût total", "", "", "", Math.round(s.cout_total)], ["Synthèse", "", "Recettes", "", "", "", Math.round(s.recettes)],
    ["Synthèse", "", "Résultat prévu", "", "", "", Math.round(s.resultat_prevu)], ["Synthèse", "", "Coût de revient", "", "", "", Math.round(s.cout_revient)],
    ["Synthèse", "", "Taux mortalité %", "", "", "", s.taux_mortalite.toFixed(1)]];
  shareOrDownload("﻿" + rows.map(r => r.map(q).join(";")).join("\n"), `lot-${l.nom.replace(/[^\w-]+/g, "_")}.csv`, "text/csv");
}

/* ------------------------------------------------------------ Démarrage */
function netState() { $("#offline").hidden = navigator.onLine; }
window.addEventListener("online", netState); window.addEventListener("offline", netState);
netState();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if (!NATIVE && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
route();
