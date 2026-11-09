// Pagina riservata /gestione-prenotazioni.html: elenco prenotazioni per evento e fascia,
// segna pagato, annulla, scarica in Excel (CSV) e stampa.
(function(){
  var box=document.getElementById('gestione'); if(!box) return;
  var API='', PWD='', eventi=[], corrente=null, righe=[], nuovaAperta=false, esitoNuova=null;
  var MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var CANALI={whatsapp:'WhatsApp',telefono:'Telefono','di persona':'Di persona',email:'E-mail',sito:'Sito'};
  function dataLunga(d){var x=new Date(d+'T12:00:00');return x.getDate()+' '+MESI[x.getMonth()]+' '+x.getFullYear();}
  // numero per wa.me: solo cifre, con prefisso internazionale (39 se e' un cellulare italiano senza prefisso)
  function numeroWa(t){var n=String(t||'').replace(/[^\d+]/g,'');if(n.indexOf('00')===0)n=n.slice(2);else if(n.charAt(0)==='+')n=n.slice(1);else if(/^3\d{8,9}$/.test(n))n='39'+n;return n.replace(/\D/g,'');}
  function testoWa(r){
    return 'Ciao '+r.nome+', la tua prenotazione per «'+corrente.titolo+(r.percorso?' – '+r.percorso:'')+'» del '+dataLunga(corrente.data)+(r.fascia!=='unica'?', partenza alle '+r.fascia:'')+', per '+r.persone+(r.persone===1?' persona':' persone')+', è confermata.\n'+
      'Codice di prenotazione: '+r.codice+'\n'+
      (r.link_annullo?'Se non potrai più venire, annulla qui: '+r.link_annullo+'\n':'')+
      'Informativa privacy: https://www.castellodisilvanopietra.com/privacy.html\n\nCastello di Silvano Pietra APS';
  }
  function waLink(r){return 'https://wa.me/'+numeroWa(r.telefono)+'?text='+encodeURIComponent(testoWa(r));}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function leggi(k){try{return sessionStorage.getItem(k)||'';}catch(e){return '';}}
  function salva(k,v){try{v?sessionStorage.setItem(k,v):sessionStorage.removeItem(k);}catch(e){}}
  function chiamata(metodo,percorso,corpo){
    return fetch(API+percorso,{method:metodo,headers:{'Content-Type':'application/json','X-Password':PWD},body:corpo?JSON.stringify(corpo):undefined})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(d){if(!r.ok){var e=new Error(d.errore||'Errore '+r.status);e.status=r.status;throw e;}return d;});});
  }

  fetch('/data/prenotazioni.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(c){
    API=String(c.api||'').replace(/\/+$/,'');
    if(!API){box.innerHTML='<p class="avviso-modulo">Il motore delle prenotazioni non è ancora collegato.</p>';return;}
    PWD=leggi('gp'); PWD?carica():accesso();
  });

  function accesso(){ // l'accesso si fa dall'area riservata, che poi riporta qui
    try{sessionStorage.removeItem('gp');}catch(e){}
    location.replace('/area-riservata.html?torna='+encodeURIComponent(location.pathname));
  }

  function carica(){
    chiamata('GET','/admin/eventi?prenotabili=1').then(function(l){
      salva('gp',PWD); eventi=l;
      if(!l.length){box.innerHTML='<p>Nessun evento prenotabile. Aggiungi un evento con prenotazioni nel calendario.</p>'+esci();legaEsci();return;}
      var sel=leggi('ge'); corrente=l.find(function(e){return e.id===sel;})||l.filter(function(e){return e.aperte;})[0]||l[0];
      elenco();
    }).catch(function(e){salva('gp','');PWD='';e.status===401?accesso():box.innerHTML='<p class="errore-modulo">'+esc(e.message)+'</p>';});
  }

  function esci(){return '<p class="gestione-esci"><button type="button" class="link-esci">Torna all\'area riservata</button></p>';}
  function legaEsci(){var b=box.querySelector('.link-esci');if(b)b.onclick=function(){location.href='/area-riservata.html';};}

  function elenco(){
    salva('ge',corrente.id);
    chiamata('GET','/admin/prenotazioni?evento='+encodeURIComponent(corrente.id)).then(function(r){righe=r;disegna();})
      .catch(function(e){box.innerHTML='<p class="errore-modulo">'+esc(e.message)+'</p>'+esci();legaEsci();});
  }

  function disegna(){
    var attive=righe.filter(function(r){return r.stato!=='annullata';});
    var persone=attive.reduce(function(s,r){return s+r.persone;},0), pagati=attive.filter(function(r){return r.pagato;}).reduce(function(s,r){return s+r.persone;},0);
    var h='<div class="gestione-testa"><label>Evento <select class="scegli-evento">'+eventi.map(function(e){
        return '<option value="'+esc(e.id)+'"'+(e.id===corrente.id?' selected':'')+'>'+esc(e.data+' · '+e.titolo)+'</option>';}).join('')+'</select></label>'+
      '<div class="gestione-azioni"><button type="button" class="bottone bottone-pieno nuova">Aggiungi prenotazione</button><button type="button" class="bottone agg">Aggiorna</button><button type="button" class="bottone csv">Scarica Excel</button><button type="button" class="bottone stampa">Stampa</button></div></div>'+
      '<p class="riepilogo">'+attive.length+' prenotazioni, '+persone+' persone, '+pagati+' segnate come pagate. Prenotazioni '+(corrente.aperte?'aperte':'chiuse')+'.</p>';
    h+=esito()+(nuovaAperta?moduloNuova():'');
    var fasce=corrente.fasce.slice(); righe.forEach(function(r){if(fasce.indexOf(r.fascia)<0)fasce.push(r.fascia);});
    // con piu' percorsi (es. Adulti e Bambini) un gruppo per ogni percorso e orario
    var percorsi=(corrente.percorsi||[]).slice(); righe.forEach(function(r){if(r.percorso&&percorsi.indexOf(r.percorso)<0)percorsi.push(r.percorso);});
    if(!percorsi.length) percorsi=[''];
    var gruppi=[]; percorsi.forEach(function(pc){fasce.forEach(function(f){gruppi.push([pc,f]);});});
    gruppi.forEach(function(g){
      var pc=g[0], f=g[1];
      var qui=righe.filter(function(r){return r.fascia===f&&(r.percorso||'')===pc;}); var occ=qui.filter(function(r){return r.stato!=='annullata';}).reduce(function(s,r){return s+r.persone;},0);
      h+='<section class="gruppo"><h2>'+(pc?esc(pc)+(f==='unica'?'':' · '):'')+(f==='unica'?(pc?'':'Prenotazioni'):'Ore '+esc(f))+' <small>'+occ+' / '+corrente.posti_per_fascia+'</small></h2>';
      if(!qui.length){h+='<p class="vuoto">Nessuna prenotazione.</p></section>';return;}
      h+='<div class="tabella-scorre"><table class="tabella"><thead><tr><th>Codice</th><th>Nome</th><th>Persone</th><th>Contatti</th><th>Tessera</th><th>Note</th><th>Pagato</th><th></th></tr></thead><tbody>'+
        qui.map(function(r){
          var ann=r.stato==='annullata';
          return '<tr class="'+(ann?'annullata':'')+'"><td class="cod">'+esc(r.codice)+(r.origine&&r.origine!=='sito'?'<br><small class="origine">'+esc(CANALI[r.origine]||r.origine)+'</small>':'')+'</td><td>'+esc(r.cognome+' '+r.nome)+'</td><td>'+r.persone+'</td>'+
            '<td>'+(r.telefono?'<a href="tel:'+esc(r.telefono)+'">'+esc(r.telefono)+'</a><br>':'')+(r.email?'<a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a>':'')+
            (r.telefono&&!ann&&numeroWa(r.telefono).length>=8?'<br><a class="link-wa" href="'+esc(waLink(r))+'" target="_blank" rel="noopener">Conferma su WhatsApp</a>':'')+'</td>'+
            '<td>'+(r.socio==='richiesta'?'Chiede adesione':r.socio==='si'?esc(r.tessera||'Socio'):'—')+'</td><td>'+esc(r.note||'')+'</td>'+
            '<td><input type="checkbox" class="pagato" data-c="'+esc(r.codice)+'"'+(r.pagato?' checked':'')+(ann?' disabled':'')+' aria-label="Pagato"></td>'+
            '<td>'+(ann?'<span class="nota-annullo">'+(r.annullata_da==='partecipante'?'Annullata dal partecipante':'Annullata')+'</span><br>':'')+'<button type="button" class="link-azione stato" data-c="'+esc(r.codice)+'" data-s="'+(ann?'confermata':'annullata')+'">'+(ann?'Ripristina':'Annulla')+'</button></td></tr>';
        }).join('')+'</tbody></table></div></section>';
    });
    box.innerHTML=h+esci(); legaEsci();
    box.querySelector('.scegli-evento').onchange=function(){corrente=eventi.find(function(e){return e.id===this.value;}.bind(this));elenco();};
    box.querySelector('.agg').onclick=carica;
    box.querySelector('.nuova').onclick=function(){nuovaAperta=true;esitoNuova=null;disegna();var f=box.querySelector('.nuova-pren');f.scrollIntoView({block:'start'});f.nome.focus();};
    var fn=box.querySelector('.nuova-pren'); if(fn) legaNuova(fn);
    var ch=box.querySelector('.chiudi-esito'); if(ch) ch.onclick=function(){esitoNuova=null;disegna();};
    box.querySelector('.stampa').onclick=function(){window.print();};
    box.querySelector('.csv').onclick=scarica;
    box.querySelectorAll('.pagato').forEach(function(c){c.onchange=function(){
      var cb=this; cb.disabled=true;
      chiamata('PATCH','/admin/prenotazioni/'+cb.dataset.c,{pagato:cb.checked}).then(function(){var r=righe.find(function(x){return x.codice===cb.dataset.c;});r.pagato=cb.checked;disegna();})
        .catch(function(e){alertaErrore(e);cb.checked=!cb.checked;cb.disabled=false;});
    };});
    box.querySelectorAll('.stato').forEach(function(b){b.onclick=function(){
      var s=this.dataset.s, c=this.dataset.c;
      if(s==='annullata'&&!confirmSicuro('Annullare la prenotazione '+c+'? I posti tornano liberi.'))return;
      chiamata('PATCH','/admin/prenotazioni/'+c,{stato:s}).then(elenco).catch(alertaErrore);
    };});
  }

  // prenotazione ricevuta su WhatsApp, al telefono o di persona: la inserisce lo staff (basta il telefono)
  function moduloNuova(){
    var occ={}; righe.forEach(function(r){if(r.stato!=='annullata'){var k=(r.percorso||'')+'|'+r.fascia;occ[k]=(occ[k]||0)+r.persone;}});
    var f=corrente.fasce, unica=f.length===1&&f[0]==='unica', perc=corrente.percorsi||[];
    return '<form class="modulo nuova-pren" novalidate><h2>Nuova prenotazione</h2>'+
      '<p class="nota-modulo">Per chi prenota su WhatsApp, al telefono o di persona. Se inserisci l\'e-mail parte la conferma automatica; dopo il salvataggio puoi mandarla anche su WhatsApp.</p><div class="campi">'+
      (perc.length?'<label>Percorso<select name="percorso" required>'+perc.map(function(x){return '<option>'+esc(x)+'</option>';}).join('')+'</select></label>':'<input type="hidden" name="percorso" value="">')+
      (unica?'<input type="hidden" name="fascia" value="unica">':'<label>Orario<select name="fascia" required>'+opzioniFasce(perc[0]||'',occ)+'</select></label>')+
      '<label>Ricevuta via<select name="origine"><option value="whatsapp">WhatsApp</option><option value="telefono">Telefono</option><option value="di persona">Di persona</option><option value="email">E-mail</option></select></label>'+
      '<label>Nome<input name="nome" required maxlength="60"></label><label>Cognome<input name="cognome" required maxlength="60"></label>'+
      '<label>Telefono<input name="telefono" type="tel" maxlength="30"></label><label><span>E-mail <span class="facoltativo">(facoltativa)</span></span><input name="email" type="email" maxlength="120"></label>'+
      '<label>Persone<input name="persone" type="number" min="1" max="'+corrente.posti_per_fascia+'" value="1" required></label></div>'+
      '<label class="lungo"><span>Note <span class="facoltativo">(facoltative)</span></span><textarea name="note" rows="2" maxlength="300"></textarea></label>'+
      '<p class="errore-modulo" role="alert" hidden></p>'+
      '<div class="gestione-azioni"><button class="bottone bottone-pieno" type="submit">Salva prenotazione</button><button class="bottone annulla-nuova" type="button">Annulla</button></div></form>';
  }
  function opzioniFasce(pc,occ){
    return corrente.fasce.map(function(x){var l=corrente.posti_per_fascia-(occ[pc+'|'+x]||0);return '<option value="'+esc(x)+'"'+(l<1?' disabled':'')+'>'+esc(x)+' · '+(l<1?'completo':l+(l===1?' libero':' liberi'))+'</option>';}).join('');
  }
  function legaNuova(form){
    var err=form.querySelector('.errore-modulo'), btn=form.querySelector('[type=submit]');
    if(form.percorso.tagName==='SELECT'&&form.fascia.tagName==='SELECT') form.percorso.onchange=function(){
      var occ={}; righe.forEach(function(r){if(r.stato!=='annullata'){var k=(r.percorso||'')+'|'+r.fascia;occ[k]=(occ[k]||0)+r.persone;}});
      form.fascia.innerHTML=opzioniFasce(form.percorso.value,occ);
    };
    form.querySelector('.annulla-nuova').onclick=function(){nuovaAperta=false;disegna();};
    form.addEventListener('submit',function(e){
      e.preventDefault(); err.hidden=true;
      var d={evento:corrente.id,staff:true,percorso:form.percorso.value,fascia:form.fascia.value,origine:form.origine.value,nome:form.nome.value.trim(),cognome:form.cognome.value.trim(),
        telefono:form.telefono.value.trim(),email:form.email.value.trim(),persone:Number(form.persone.value),note:form.note.value.trim()};
      var problema=!d.fascia?'Scegli un orario.':!d.nome||!d.cognome?'Inserisci nome e cognome.':!d.telefono&&!d.email?'Serve il telefono o l\'e-mail.':'';
      if(problema){err.textContent=problema;err.hidden=false;return;}
      btn.disabled=true; btn.textContent='Salvataggio…';
      chiamata('POST','/prenotazioni',d).then(function(r){esitoNuova=r;nuovaAperta=false;elenco();})
        .catch(function(e2){err.textContent=e2.message;err.hidden=false;btn.disabled=false;btn.textContent='Salva prenotazione';});
    });
  }
  function esito(){
    if(!esitoNuova) return '';
    var r=esitoNuova, wa=r.telefono&&numeroWa(r.telefono).length>=8;
    return '<div class="esito-nuova"><p><strong>Prenotazione '+esc(r.codice)+' salvata</strong>: '+esc(r.nome)+', '+r.persone+(r.persone===1?' persona':' persone')+(r.percorso?', '+esc(r.percorso):'')+(r.fascia!=='unica'?', ore '+esc(r.fascia):'')+'.'+
      (r.email_conferma?' Conferma inviata per e-mail.':'')+'</p><div class="gestione-azioni">'+
      (wa?'<a class="bottone bottone-pieno" href="'+esc(waLink(r))+'" target="_blank" rel="noopener">Invia la conferma su WhatsApp</a>':'')+
      '<button type="button" class="bottone chiudi-esito">Chiudi</button></div></div>';
  }

  // conferma inline senza finestre del browser
  function confirmSicuro(msg){
    var p=box.querySelector('.riepilogo');
    if(p.dataset.attesa===msg){delete p.dataset.attesa;p.classList.remove('chiedi');return true;}
    p.dataset.attesa=msg; p.classList.add('chiedi'); p.textContent=msg+' Premi di nuovo «Annulla» per confermare.';
    return false;
  }
  function alertaErrore(e){var p=box.querySelector('.riepilogo');p.classList.add('chiedi');p.textContent='Errore: '+e.message;}

  function scarica(){
    var col=['Codice','Canale','Percorso','Fascia','Cognome','Nome','Persone','Telefono','E-mail','Tessera','Note','Stato','Pagato','Creata'];
    var q=function(v){v=String(v==null?'':v);return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    var rows=righe.map(function(r){return [r.codice,CANALI[r.origine]||'Sito',r.percorso||'',r.fascia,r.cognome,r.nome,r.persone,r.telefono,r.email,r.socio==='richiesta'?'Chiede adesione':r.socio==='si'?(r.tessera||'Socio'):'',r.note,r.stato+(r.annullata_da==='partecipante'?' dal partecipante':''),r.pagato?'Sì':'No',r.creata].map(q).join(';');});
    var blob=new Blob(['﻿'+col.join(';')+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='prenotazioni-'+corrente.id+'.csv';document.body.appendChild(a);a.click();a.remove();
  }
})();
