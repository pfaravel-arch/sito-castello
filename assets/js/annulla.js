// Pagina /annulla.html?c=CODICE&k=CHIAVE, aperta dal link nell'e-mail di conferma.
(function(){
  var box=document.getElementById('annulla'); if(!box) return;
  var q=new URLSearchParams(location.search), c=(q.get('c')||'').toUpperCase(), k=q.get('k')||'';
  var MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var API='';
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(x){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x];});}
  function data(d){var x=new Date(d+'T12:00:00');return x.getDate()+' '+MESI[x.getMonth()]+' '+x.getFullYear();}
  var contatti='<p>Per qualsiasi necessità scrivici a <a href="mailto:castellodisilvanopietra@gmail.com?subject=Prenotazione%20'+encodeURIComponent(c)+'">castellodisilvanopietra@gmail.com</a> o su WhatsApp al <a href="https://wa.me/393513479312">351 347 9312</a>.</p>';
  function messaggio(t,testo){box.innerHTML='<h1>'+t+'</h1><p class="introduzione">'+testo+'</p>'+contatti+'<p><a href="/eventi.html">Vai agli eventi</a></p>';}
  function chiamata(metodo,percorso,corpo){
    return fetch(API+percorso,{method:metodo,headers:{'Content-Type':'application/json'},body:corpo?JSON.stringify(corpo):undefined})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(d){if(!r.ok) throw new Error(d.errore||'Errore '+r.status);return d;});});
  }
  if(!/^[A-Z0-9]{6}$/.test(c)||!k){messaggio('Link incompleto','Apri il link «Annulla la prenotazione» direttamente dall\'e-mail di conferma.');return;}

  fetch('/data/prenotazioni.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(cfg){
    API=String(cfg.api||'').replace(/\/+$/,'');
    return chiamata('GET','/prenotazioni/'+c+'?k='+encodeURIComponent(k));
  }).then(function(p){
    var riepilogo='<ul class="elenco-semplice">'+
      '<li><span>Evento</span><span>'+esc(p.titolo)+'</span></li>'+
      (p.percorso?'<li><span>Percorso</span><span>'+esc(p.percorso_etichetta||p.percorso)+'</span></li>':'')+
      '<li><span>Quando</span><span>'+esc(data(p.data))+(p.fascia!=='unica'?', partenza alle '+esc(p.fascia):'')+'</span></li>'+
      '<li><span>Persone</span><span>'+p.persone+'</span></li>'+
      '<li><span>Codice</span><span>'+esc(p.codice)+'</span></li></ul>';
    if(p.stato==='annullata'){box.innerHTML='<h1>Prenotazione già annullata</h1>'+riepilogo+'<p>I posti sono già tornati disponibili.</p><p><a href="/eventi.html">Vai agli eventi</a></p>';return;}
    if(!p.annullabile){box.innerHTML='<h1>Annullamento non disponibile</h1>'+riepilogo+'<p class="introduzione">Le prenotazioni per questo evento sono chiuse, quindi non si può più annullare online.</p>'+contatti;return;}
    box.innerHTML='<h1>Annulla la prenotazione</h1><p class="introduzione">Ciao '+esc(p.nome)+', vuoi annullare questa prenotazione? I posti torneranno disponibili per altri.</p>'+riepilogo+
      '<p class="errore-modulo" role="alert" hidden></p>'+
      '<p class="evento-azioni"><button type="button" class="bottone bottone-pieno conferma">Conferma l\'annullamento</button> <a class="bottone" href="/eventi.html">No, tengo la prenotazione</a></p>';
    var btn=box.querySelector('.conferma'), err=box.querySelector('.errore-modulo');
    btn.onclick=function(){
      btn.disabled=true; btn.textContent='Annullamento…';
      chiamata('POST','/prenotazioni/'+c+'/annulla',{k:k}).then(function(){
        box.innerHTML='<h1>Prenotazione annullata</h1>'+riepilogo+'<p class="introduzione">Fatto: i posti sono di nuovo disponibili. Ti abbiamo inviato una e-mail di conferma dell\'annullamento.</p><p>Grazie di averci avvisato. Se cambi idea puoi prenotare di nuovo, finché ci sono posti.</p><p><a href="/eventi.html">Vai agli eventi</a></p>';
      }).catch(function(e){err.textContent=e.message;err.hidden=false;btn.disabled=false;btn.textContent='Conferma l\'annullamento';});
    };
  }).catch(function(e){
    messaggio('Prenotazione non trovata',esc(e.message));
  });
})();
