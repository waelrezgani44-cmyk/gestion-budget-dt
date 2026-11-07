import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Wallet, TrendingUp, TrendingDown, Receipt, Plus, Trash2, Download, Upload, RefreshCw, LayoutDashboard, ArrowLeftRight, CreditCard, Search, Pencil, X, CalendarDays, ShieldCheck, WifiOff } from 'lucide-react';
import './style.css';

const API = '/api';
const cats = ['Pharmacie', 'Épicerie', 'Transport', 'Factures', 'Logement', 'Santé', 'Salaire', 'Éducation', 'Loisirs', 'Autres'];
const money = n => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(n || 0)) + ' DT';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateLabel = value => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '—';

function App() {
  const [tab, setTab] = useState('dashboard');
  const [dash, setDash] = useState({});
  const [moves, setMoves] = useState([]);
  const [credits, setCredits] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [a, setA] = useState({ doctor: '', appointment_date: today(), consultation_amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [editId, setEditId] = useState(null);
  const [m, setM] = useState({ kind: 'expense', category: 'Épicerie', description: '', amount: '', movement_date: today() });
  const [c, setC] = useState({ merchant: '', category: 'Épicerie', purchase_date: today(), note: '', items: [{ name: '', price: '' }], installments: [{ due_date: today(), amount: '' }] });
  const [pay, setPay] = useState({});

  async function req(path, opts = {}) {
    const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw Error(d.detail || 'Erreur serveur'); }
    return r.json();
  }
  async function load() {
    setBusy(true); setError('');
    try {
      const [d, a, b, ap] = await Promise.all([req('/dashboard'), req('/movements'), req('/credits'), req('/appointments')]);
      setDash(d); setMoves(a); setCredits(b); setAppointments(ap); setOffline(false);
      try { localStorage.setItem('budget-dt-cache', JSON.stringify({ dash: d, movements: a, credits: b, appointments: ap, savedAt: new Date().toISOString() })); } catch (_) {}
    } catch (e) {
      setError(e.message);
      try {
        const cache = JSON.parse(localStorage.getItem('budget-dt-cache') || 'null');
        if (cache) { setDash(cache.dash || {}); setMoves(cache.movements || []); setCredits(cache.credits || []); setAppointments(cache.appointments || []); setOffline(true); setError('Serveur indisponible : dernière copie locale affichée en lecture seule.'); }
      } catch (_) {}
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  function resetMovement() { setEditId(null); setM({ kind: 'expense', category: 'Épicerie', description: '', amount: '', movement_date: today() }); }
  async function saveMove(e) {
    e.preventDefault();
    try {
      const payload = { ...m, amount: Number(m.amount) };
      await req(editId ? `/movements/${editId}` : '/movements', { method: editId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      resetMovement(); await load();
    } catch (e) { setError(e.message); }
  }
  function editMove(x) {
    setM({ kind: x.kind, category: x.category, description: x.description || '', amount: String(x.amount), movement_date: x.movement_date });
    setEditId(x.id); setTab('movements'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function addCredit(e) {
    e.preventDefault();
    try {
      await req('/credits', { method: 'POST', body: JSON.stringify({ ...c, items: c.items.map(i => ({ ...i, price: Number(i.price) })), installments: c.installments.filter(i => i.due_date && Number(i.amount)>0).map(i => ({ ...i, amount: Number(i.amount) })) }) });
      setC({ merchant: '', category: 'Épicerie', purchase_date: today(), note: '', items: [{ name: '', price: '' }], installments: [{ due_date: today(), amount: '' }] }); await load();
    } catch (e) { setError(e.message); }
  }
  async function addPayment(id) {
    try { await req(`/credits/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount: Number(pay[id]), payment_date: today(), note: '' }) }); setPay({ ...pay, [id]: '' }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function deleteMove(id) {
    if (!confirm('Supprimer définitivement ce mouvement ?')) return;
    try { await req('/movements/' + id, { method: 'DELETE' }); if (editId === id) resetMovement(); await load(); }
    catch (e) { setError(e.message); }
  }
  async function exportData() {
    try { const data = await req('/backup'); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sauvegarde-budget-dt-${today()}.json`; a.click(); URL.revokeObjectURL(url); }
    catch (e) { setError(e.message); }
  }
  async function importData(e) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const data = JSON.parse(await file.text()); if (!confirm('La restauration ajoute les données du fichier aux données existantes. Faire une sauvegarde avant de continuer. Poursuivre ?')) return; await req('/restore', { method: 'POST', body: JSON.stringify(data) }); await load(); alert('Restauration terminée. Les données du fichier ont été ajoutées.'); }
    catch (err) { setError(err.message); } finally { e.target.value = ''; }
  }

  const filteredMoves = useMemo(() => moves.filter(x => (kindFilter === 'all' || x.kind === kindFilter) && `${x.description} ${x.category} ${x.movement_date}`.toLowerCase().includes(query.toLowerCase())), [moves, kindFilter, query]);
  const totalCredit = credits.reduce((s, x) => s + x.remaining, 0);
  const maxMonthly = Math.max(1, ...(dash.monthly_history || []).flatMap(x => [x.income, x.expenses]));
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date());
  const todayDate = new Date(`${today()}T12:00:00`);
  const reminderRows = credits.flatMap(x => (x.installments || []).filter(i => !i.paid && Math.round((new Date(`${i.due_date}T12:00:00`) - todayDate)/86400000) <= 5 && Math.round((new Date(`${i.due_date}T12:00:00`) - todayDate)/86400000) >= 0).map(i => ({id:`i${i.id}`, label:x.merchant, date:i.due_date, amount:i.amount, days:Math.round((new Date(`${i.due_date}T12:00:00`)-todayDate)/86400000), type:'Échéance'})))
    .concat(appointments.filter(x => !x.completed && Math.round((new Date(`${x.appointment_date}T12:00:00`)-todayDate)/86400000) <= 5 && Math.round((new Date(`${x.appointment_date}T12:00:00`)-todayDate)/86400000) >= 0).map(x => ({id:`a${x.id}`, label:x.doctor, date:x.appointment_date, amount:x.consultation_amount, days:Math.round((new Date(`${x.appointment_date}T12:00:00`)-todayDate)/86400000), type:'Rendez-vous médical'})));
  const monthlyRows = Array.from({length:12}, (_,idx) => { const d=new Date(new Date().getFullYear(),idx,1); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; const sum=(arr,fn)=>arr.filter(x=>fn(x).startsWith(key)).reduce((v,x)=>v+Number(x.amount||0),0); const exp=sum(moves,x=>x.movement_date); const due=sum(credits.flatMap(c=>(c.installments||[]).map(i=>({ ...i }))),x=>x.due_date); const med=sum(appointments,x=>x.appointment_date); return {month:new Intl.DateTimeFormat('fr-FR',{month:'long'}).format(d), expenses:exp, installments:due, medical:med, total:exp+due+med}; });
  async function addAppointment(e) { e.preventDefault(); try { await req('/appointments',{method:'POST',body:JSON.stringify({...a,consultation_amount:Number(a.consultation_amount||0)})}); setA({doctor:'',appointment_date:today(),consultation_amount:'',note:''}); await load(); } catch(e){setError(e.message);} }
  async function completeAppointment(id) { try { await req(`/appointments/${id}/complete`,{method:'PUT'}); await load(); } catch(e){setError(e.message);} }
  async function markInstallmentPaid(id) { try { await req(`/installments/${id}/paid`,{method:'PUT'}); await load(); } catch(e){setError(e.message);} }


  const nav = [
    ['dashboard', 'Vue d’ensemble', LayoutDashboard],
    ['movements', 'Revenus & dépenses', ArrowLeftRight],
    ['credits', 'Achats à crédit', CreditCard],
    ['medical', 'Rendez-vous médicaux', CalendarDays],
    ['summary', 'Récapitulatif mensuel', Receipt]
  ];

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brandmark"><Wallet size={22}/></span><span>Budget <b>DT</b><small>GESTION PERSONNELLE</small></span></div>
      <div className="navlabel">ESPACE DE GESTION</div>
      <nav>{nav.map(([id, label, Icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebottom">
        <div className="secure-note"><ShieldCheck size={17}/><span>Vos données restent sur votre serveur</span></div>
        <button onClick={exportData}><Download size={17}/> Sauvegarder les données</button>
        <label className="filebtn"><Upload size={17}/> Restaurer une sauvegarde<input type="file" accept="application/json" onChange={importData}/></label>
      </div>
    </aside>

    <main>
      <header className="topbar"><div><small>GESTION BUDGÉTAIRE</small><h1>{nav.find(x => x[0] === tab)?.[1]}</h1><p className="subhead">Suivez votre budget et gardez une vision claire de vos finances.</p></div><div className="top-actions">{offline && <span className="offline"><WifiOff size={15}/> Hors connexion</span>}<button className="iconbtn" onClick={load} title="Actualiser" disabled={busy}><RefreshCw size={18} className={busy ? 'spin' : ''}/></button></div></header>
      {error && <div className={offline ? 'notice' : 'error'}>{error}</div>}
      {offline && <div className="readonly-note"><WifiOff size={16}/> Mode lecture seule : les modifications seront disponibles après reconnexion.</div>}

      {tab === 'dashboard' && <>
        <div className="sectionintro"><div><h2>Votre situation financière</h2><p>Vue globale de vos mouvements enregistrés</p></div><span className="period"><CalendarDays size={15}/>{monthName}</span></div>
        <section className="cards">
          <article className="balance"><span><Wallet size={17}/> Solde disponible</span><strong>{money(dash.balance)}</strong><small>Revenus − dépenses − paiements de crédits</small></article>
          <article><span><TrendingUp/> Revenus cumulés</span><strong className="green">{money(dash.income)}</strong><small>Tous les revenus enregistrés</small></article>
          <article><span><TrendingDown/> Dépenses cumulées</span><strong className="red">{money(dash.expenses)}</strong><small>Toutes les dépenses enregistrées</small></article>
          <article><span><Receipt/> Crédits à rembourser</span><strong className="orange">{money(dash.credit_remaining)}</strong><small>Reste dû sur les achats à crédit</small></article>
        </section>
        <section className="monthcards">
          <article><span>Revenus du mois</span><b className="green">{money(dash.month_income)}</b></article>
          <article><span>Dépenses du mois</span><b className="red">{money(dash.month_expenses)}</b></article>
          <article><span>Solde du mois</span><b className={Number(dash.month_balance) >= 0 ? 'green' : 'red'}>{money(dash.month_balance)}</b></article>
        </section>
        <div className="dashboard-grid">
          <section className="panel"><div className="panelhead"><div><h2>Évolution sur 6 mois</h2><p>Comparaison des revenus et dépenses</p></div></div>
            <div className="chart">{(dash.monthly_history || []).map((x, i) => <div className="chartgroup" key={x.label}><div className="bars"><div className="bar income-bar" title={`Revenus : ${money(x.income)}`} style={{ height: `${Math.max(3, x.income / maxMonthly * 116)}px` }}/><div className="bar expense-bar" title={`Dépenses : ${money(x.expenses)}`} style={{ height: `${Math.max(3, x.expenses / maxMonthly * 116)}px` }}/></div><small>{x.label}</small></div>)}</div>
            <div className="legend"><span><i className="legend-income"/> Revenus</span><span><i className="legend-expense"/> Dépenses</span></div>
          </section>
          <section className="panel"><div className="panelhead"><div><h2>Dépenses par catégorie</h2><p>Répartition du mois en cours</p></div></div>
            {(dash.expense_categories || []).length ? <div className="category-list">{dash.expense_categories.slice(0, 6).map(x => { const max = Math.max(...dash.expense_categories.map(y => y.amount), 1); return <div className="category-item" key={x.category}><div><span>{x.category}</span><b>{money(x.amount)}</b></div><div className="track"><i style={{ width: `${x.amount / max * 100}%` }}/></div></div>; })}</div> : <p className="empty">Aucune dépense ce mois-ci.</p>}
          </section>
        </div>
        <section className="panel"><div className="panelhead"><div><h2>Mes rappels</h2><p>Échéances et rendez-vous à venir dans les 5 jours</p></div></div>
          {reminderRows.length ? reminderRows.map(r=><div className="line" key={r.id}><div className="move-icon"><CalendarDays size={17}/></div><div className="move-label"><b>{r.type} · {r.label}</b><small>{dateLabel(r.date)} · {r.days===0 ? "Aujourd’hui" : `Dans ${r.days} jour(s)`}</small></div><strong className="orange">{money(r.amount)}</strong></div>) : <p className="empty">Aucun rappel pour les 5 prochains jours.</p>}
        </section>
        <section className="panel"><div className="panelhead"><div><h2>Dernières opérations</h2><p>Vos mouvements les plus récents</p></div><button className="link" onClick={() => setTab('movements')}>Tout afficher →</button></div>
          {moves.slice(0, 6).length ? moves.slice(0, 6).map(x => <div className="line" key={x.id}><div className="move-icon">{x.kind === 'income' ? <TrendingUp size={17}/> : <TrendingDown size={17}/>}</div><div className="move-label"><b>{x.description || x.category}</b><small>{x.category} · {dateLabel(x.movement_date)}</small></div><strong className={x.kind === 'income' ? 'green' : 'red'}>{x.kind === 'income' ? '+' : '−'}{money(x.amount)}</strong></div>) : <p className="empty">Aucun mouvement enregistré.</p>}
        </section>
      </>}

      {tab === 'movements' && <>
        <section className="panel"><div className="panelhead"><div><h2>{editId ? 'Modifier le mouvement' : 'Ajouter un mouvement'}</h2><p>Enregistrez un revenu ou une dépense</p></div>{editId && <button className="secondary" type="button" onClick={resetMovement}><X size={16}/> Annuler</button>}</div>
          <form onSubmit={saveMove} className="formgrid"><label>Type<select disabled={offline} value={m.kind} onChange={e => setM({ ...m, kind: e.target.value })}><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><label>Catégorie<select disabled={offline} value={m.category} onChange={e => setM({ ...m, category: e.target.value })}>{cats.map(x => <option key={x}>{x}</option>)}</select></label><label>Description<input disabled={offline} value={m.description} onChange={e => setM({ ...m, description: e.target.value })} placeholder="Ex. Courses du mois" maxLength={250}/></label><label>Montant (DT)<input disabled={offline} type="number" min="0.001" step="0.001" required value={m.amount} onChange={e => setM({ ...m, amount: e.target.value })}/></label><label>Date de l’opération<input disabled={offline} type="date" required value={m.movement_date} onChange={e => setM({ ...m, movement_date: e.target.value })}/></label><div className="form-submit"><button className="primary" disabled={offline}>{editId ? <Pencil size={17}/> : <Plus size={17}/>} {editId ? 'Enregistrer les modifications' : 'Ajouter le mouvement'}</button></div></form>
        </section>
        <section className="panel"><div className="panelhead"><div><h2>Historique des opérations</h2><p>{filteredMoves.length} opération(s) affichée(s)</p></div></div><div className="filters"><div className="searchbox"><Search size={17}/><input placeholder="Rechercher une opération…" value={query} onChange={e => setQuery(e.target.value)}/></div><select value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">Tous les types</option><option value="income">Revenus</option><option value="expense">Dépenses</option></select></div>
          {filteredMoves.map(x => <div className="line" key={x.id}><div className="move-icon">{x.kind === 'income' ? <TrendingUp size={17}/> : <TrendingDown size={17}/>}</div><div className="move-label"><b>{x.description || x.category}</b><small>{x.category} · {dateLabel(x.movement_date)}</small></div><strong className={x.kind === 'income' ? 'green' : 'red'}>{x.kind === 'income' ? '+' : '−'}{money(x.amount)}</strong><div className="row-actions"><button className="edit" disabled={offline} title="Modifier" onClick={() => editMove(x)}><Pencil size={16}/></button><button className="del" disabled={offline} title="Supprimer" onClick={() => deleteMove(x.id)}><Trash2 size={16}/></button></div></div>)}
          {!filteredMoves.length && <p className="empty">Aucune opération ne correspond à votre recherche.</p>}
        </section>
      </>}

      {tab === 'credits' && <>
        <section className="panel"><div className="panelhead"><div><h2>Enregistrer un achat à crédit</h2><p>Ajoutez les produits et suivez les remboursements</p></div></div><form onSubmit={addCredit}><div className="formgrid"><label>Commerçant<input disabled={offline} required value={c.merchant} onChange={e => setC({ ...c, merchant: e.target.value })} placeholder="Nom du magasin" maxLength={160}/></label><label>Catégorie<select disabled={offline} value={c.category} onChange={e => setC({ ...c, category: e.target.value })}>{cats.map(x => <option key={x}>{x}</option>)}</select></label><label>Date de l’achat<input disabled={offline} type="date" required value={c.purchase_date} onChange={e => setC({ ...c, purchase_date: e.target.value })}/></label><label>Note<input disabled={offline} value={c.note} onChange={e => setC({ ...c, note: e.target.value })} maxLength={250}/></label></div><h3>Produits achetés</h3>{c.items.map((it, i) => <div className="itemrow" key={i}><input disabled={offline} required placeholder="Nom du produit" value={it.name} onChange={e => setC({ ...c, items: c.items.map((v, j) => j === i ? { ...v, name: e.target.value } : v) })}/><input disabled={offline} required type="number" min="0.001" step="0.001" placeholder="Prix DT" value={it.price} onChange={e => setC({ ...c, items: c.items.map((v, j) => j === i ? { ...v, price: e.target.value } : v) })}/>{c.items.length > 1 && <button disabled={offline} type="button" className="del" onClick={() => setC({ ...c, items: c.items.filter((_, j) => j !== i) })}><Trash2 size={16}/></button>}</div>)}<button disabled={offline} type="button" className="secondary" onClick={() => setC({ ...c, items: [...c.items, { name: '', price: '' }] })}><Plus size={16}/> Ajouter un produit</button><h3>Échéancier de paiement (facultatif)</h3>{c.installments.map((it,i)=><div className="itemrow" key={`inst${i}`}><input aria-label="Date de l’échéance" type="date" value={it.due_date} onChange={e=>setC({...c,installments:c.installments.map((v,j)=>j===i?{...v,due_date:e.target.value}:v)})}/><input aria-label="Montant de l’échéance" type="number" min="0.001" step="0.001" placeholder="Montant DT" value={it.amount} onChange={e=>setC({...c,installments:c.installments.map((v,j)=>j===i?{...v,amount:e.target.value}:v)})}/>{c.installments.length>1&&<button type="button" className="del" onClick={()=>setC({...c,installments:c.installments.filter((_,j)=>j!==i)})}><Trash2 size={16}/></button>}</div>)}<button type="button" className="secondary" onClick={()=>setC({...c,installments:[...c.installments,{due_date:today(),amount:''}]})}><Plus size={16}/> Ajouter une échéance</button><div className="submitrow"><b>Total : {money(c.items.reduce((s, x) => s + Number(x.price || 0), 0))}</b><button disabled={offline} className="primary">Enregistrer le crédit</button></div></form></section>
        <section className="panel"><div className="panelhead"><div><h2>Suivi des crédits</h2><p>Reste total à rembourser</p></div><strong className="orange">{money(totalCredit)}</strong></div>
          {credits.map(x => <div className="credit" key={x.id}><div className="credithead"><div><b>{x.merchant}</b><small>{x.category} · {dateLabel(x.purchase_date)}</small></div><strong className={x.remaining ? 'orange' : 'green'}>{money(x.remaining)} restant</strong></div><div className="productlist">{x.items.map(i => <span key={i.id}>{i.name} — {money(i.price)}</span>)}</div>{(x.installments||[]).length>0 && <div className="installments"><b>Échéancier</b>{x.installments.map(i=><div className="line" key={i.id}><div className="move-label"><b>{dateLabel(i.due_date)}</b><small>{i.paid?'Payé':`Rappel 5 jours avant · ${money(i.amount)}`}</small></div>{!i.paid&&<button className="secondary" onClick={()=>markInstallmentPaid(i.id)}>Marquer payé</button>}</div>)}</div>}<div className="creditstats"><span>Total : {money(x.total)}</span><span>Payé : {money(x.paid)}</span></div>{x.remaining > 0 && <div className="payrow"><input disabled={offline} type="number" min="0.001" max={x.remaining} step="0.001" placeholder="Paiement DT" value={pay[x.id] || ''} onChange={e => setPay({ ...pay, [x.id]: e.target.value })}/><button disabled={offline || !pay[x.id]} className="primary" onClick={() => addPayment(x.id)}>Enregistrer le paiement</button></div>}{x.payments.map(p => <small className="payment" key={p.id}>Paiement de {money(p.amount)} · {dateLabel(p.payment_date)}</small>)}</div>)}
          {!credits.length && <p className="empty">Aucun achat à crédit enregistré.</p>}
        </section>
      </>}
      {tab === 'medical' && <>
        <section className="panel"><div className="panelhead"><div><h2>Ajouter un rendez-vous médical</h2><p>Un rappel sera affiché 5 jours avant la date.</p></div></div><form onSubmit={addAppointment} className="formgrid"><label>Médecin / établissement<input required maxLength="160" value={a.doctor} onChange={e=>setA({...a,doctor:e.target.value})} placeholder="Nom du médecin"/></label><label>Date du rendez-vous<input type="date" required value={a.appointment_date} onChange={e=>setA({...a,appointment_date:e.target.value})}/></label><label>Montant de la consultation (DT)<input type="number" min="0" step="0.001" value={a.consultation_amount} onChange={e=>setA({...a,consultation_amount:e.target.value})}/></label><label>Note<input maxLength="250" value={a.note} onChange={e=>setA({...a,note:e.target.value})} placeholder="Spécialité, adresse…"/></label><div className="form-submit"><button className="primary">Enregistrer le rendez-vous</button></div></form></section>
        <section className="panel"><div className="panelhead"><div><h2>Mes rendez-vous</h2><p>Historique et prochaines consultations</p></div></div>{appointments.map(x=><div className="line" key={x.id}><div className="move-icon"><CalendarDays size={17}/></div><div className="move-label"><b>{x.doctor}</b><small>{dateLabel(x.appointment_date)} · {x.completed?'Terminé':'À venir'} · {x.note}</small></div><strong>{money(x.consultation_amount)}</strong>{!x.completed&&<button className="secondary" onClick={()=>completeAppointment(x.id)}>Terminé</button>}<button className="del" onClick={async()=>{await req(`/appointments/${x.id}`,{method:'DELETE'});load();}}><Trash2 size={16}/></button></div>)}{!appointments.length&&<p className="empty">Aucun rendez-vous enregistré.</p>}</section>
      </>}
      {tab === 'summary' && <section className="panel"><div className="panelhead"><div><h2>Récapitulatif mensuel</h2><p>Aperçu des dépenses, échéances prévues et consultations de l’année en cours</p></div></div><div className="tablewrap"><table><thead><tr><th>Mois</th><th>Dépenses</th><th>Échéances prévues</th><th>Consultations</th><th>Total suivi</th></tr></thead><tbody>{monthlyRows.map(r=><tr key={r.month}><td>{r.month}</td><td>{money(r.expenses)}</td><td>{money(r.installments)}</td><td>{money(r.medical)}</td><td><b>{money(r.total)}</b></td></tr>)}</tbody></table></div></section>}
      <footer>Gestion Budget DT · Montants en dinars tunisiens (DT) · {offline ? 'Copie locale' : busy ? 'Synchronisation…' : 'Données synchronisées'}</footer>
    </main>
  </div>;
}

function PinGate({ children }) {
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState(!localStorage.getItem('budget-dt-pin-hash'));
  const [message, setMessage] = useState('');
  async function hash(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function submit(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) { setMessage('Le code doit contenir exactement 4 chiffres.'); return; }
    if (first) { localStorage.setItem('budget-dt-pin-hash', await hash(pin)); setFirst(false); setReady(true); setMessage(''); }
    else if ((await hash(pin)) === localStorage.getItem('budget-dt-pin-hash')) { setReady(true); setMessage(''); }
    else { setPin(''); setMessage('Code incorrect. Réessayez.'); }
  }
  if (ready) return children;
  return <div className="pin-screen"><form className="pin-card" onSubmit={submit}><div className="brandmark"><Wallet size={24}/></div><h1>Gestion Budget DT</h1><p>{first ? 'Créez votre code PIN personnel à 4 chiffres.' : 'Entrez votre code PIN pour ouvrir l’application.'}</p><input autoFocus inputMode="numeric" pattern="[0-9]{4}" maxLength="4" type="password" placeholder="••••" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} aria-label="Code PIN à 4 chiffres"/><button className="primary" type="submit">{first ? 'Créer mon code' : 'Déverrouiller'}</button>{message && <small role="alert">{message}</small>}<small className="pin-warning">Le PIN protège l’accès sur cet appareil, mais ne remplace pas le chiffrement ni la sécurité du serveur.</small></form></div>;
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
createRoot(document.getElementById('root')).render(<PinGate><App/></PinGate>);
