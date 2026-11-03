// Pagina riservata /gestione-prenotazioni.html: elenco prenotazioni per evento e fascia,
// segna pagato, annulla, scarica in Excel (CSV) e stampa.
(function(){
  var box=document.getElementById('gestione'); if(!box) return;
  var API='', PWD='', eventi=[], corrente=null, righe=[];
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
      '<div class="gestione-azioni"><button type="button" class="bottone agg">Aggiorna</button><button type="button" class="bottone csv">Scarica Excel</button><button type="button" class="bottone stampa">Stampa</button></div></div>'+
      '<p class="riepilogo">'+attive.length+' prenotazioni, '+persone+' persone, '+pagati+' segnate come pagate. Prenotazioni '+(corrente.aperte?'aperte':'chiuse')+'.</p>';
    var fasce=corrente.fasce.slice(); righe.forEach(function(r){if(fasce.indexOf(r.fascia)<0)fasce.push(r.fascia);});
    fasce.forEach(function(f){
      var qui=righe.filter(function(r){return r.fascia===f;}); var occ=qui.filter(function(r){return r.stato!=='annullata';}).reduce(function(s,r){return s+r.persone;},0);
      h+='<section class="gruppo"><h2>'+(f==='unica'?'Prenotazioni':'Ore '+esc(f))+' <small>'+occ+' / '+corrente.posti_per_fascia+'</small></h2>';
      if(!qui.length){h+='<p class="vuoto">Nessuna prenotazione.</p></section>';return;}
      h+='<div class="tabella-scorre"><table class="tabella"><thead><tr><th>Codice</th><th>Nome</th><th>Persone</th><th>Contatti</th><th>Tessera</th><th>Note</th><th>Pagato</th><th></th></tr></thead><tbody>'+
        qui.map(function(r){
          var ann=r.stato==='annullata';
          return '<tr class="'+(ann?'annullata':'')+'"><td class="cod">'+esc(r.codice)+'</td><td>'+esc(r.cognome+' '+r.nome)+'</td><td>'+r.persone+'</td>'+
            '<td>'+(r.telefono?'<a href="tel:'+esc(r.telefono)+'">'+esc(r.telefono)+'</a><br>':'')+(r.email?'<a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a>':'')+'</td>'+
            '<td>'+(r.socio==='richiesta'?'Chiede adesione':esc(r.tessera||'Socio'))+'</td><td>'+esc(r.note||'')+'</td>'+
            '<td><input type="checkbox" class="pagato" data-c="'+esc(r.codice)+'"'+(r.pagato?' checked':'')+(ann?' disabled':'')+' aria-label="Pagato"></td>'+
            '<td>'+(ann?'<span class="nota-annullo">'+(r.annullata_da==='partecipante'?'Annullata dal partecipante':'Annullata')+'</span><br>':'')+'<button type="button" class="link-azione stato" data-c="'+esc(r.codice)+'" data-s="'+(ann?'confermata':'annullata')+'">'+(ann?'Ripristina':'Annulla')+'</button></td></tr>';
        }).join('')+'</tbody></table></div></section>';
    });
    box.innerHTML=h+esci(); legaEsci();
    box.querySelector('.scegli-evento').onchange=function(){corrente=eventi.find(function(e){return e.id===this.value;}.bind(this));elenco();};
    box.querySelector('.agg').onclick=carica;
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

  // conferma inline senza finestre del browser
  function confirmSicuro(msg){
    var p=box.querySelector('.riepilogo');
    if(p.dataset.attesa===msg){delete p.dataset.attesa;p.classList.remove('chiedi');return true;}
    p.dataset.attesa=msg; p.classList.add('chiedi'); p.textContent=msg+' Premi di nuovo «Annulla» per confermare.';
    return false;
  }
  function alertaErrore(e){var p=box.querySelector('.riepilogo');p.classList.add('chiedi');p.textContent='Errore: '+e.message;}

  function scarica(){
    var col=['Codice','Fascia','Cognome','Nome','Persone','Telefono','E-mail','Tessera','Note','Stato','Pagato','Creata'];
    var q=function(v){v=String(v==null?'':v);return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    var rows=righe.map(function(r){return [r.codice,r.fascia,r.cognome,r.nome,r.persone,r.telefono,r.email,r.socio==='richiesta'?'Chiede adesione':(r.tessera||'Socio'),r.note,r.stato+(r.annullata_da==='partecipante'?' dal partecipante':''),r.pagato?'Sì':'No',r.creata].map(q).join(';');});
    var blob=new Blob(['﻿'+col.join(';')+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='prenotazioni-'+corrente.id+'.csv';document.body.appendChild(a);a.click();a.remove();
  }
})();
