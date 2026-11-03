// Pagina riservata /gestione-eventi.html: crea, modifica, duplica, chiude ed elimina gli eventi,
// carica le locandine e attiva le prenotazioni online. Stessa password della gestione prenotazioni.
(function(){
  var box=document.getElementById('gestione-eventi'); if(!box) return;
  var API='', PWD='', eventi=[], avviso='';
  var MESI=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  var LUOGO='Castello di Silvano Pietra, Piazza Vittorio Veneto 4';
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function leggi(k){try{return sessionStorage.getItem(k)||'';}catch(e){return '';}}
  function salva(k,v){try{v?sessionStorage.setItem(k,v):sessionStorage.removeItem(k);}catch(e){}}
  function chiamata(metodo,percorso,corpo,tipo){
    var h={'X-Password':PWD}; if(corpo!=null) h['Content-Type']=tipo||'application/json';
    return fetch(API+percorso,{method:metodo,headers:h,body:corpo==null?undefined:(tipo?corpo:JSON.stringify(corpo))})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(d){if(!r.ok){var e=new Error(d.errore||'Errore '+r.status);e.status=r.status;throw e;}return d;});});
  }
  var oggi=new Date(); oggi.setHours(0,0,0,0);
  function passato(e){return e.stato==='chiuso'||new Date((e.fine||e.data)+'T23:59:59')<oggi;}
  function dataBreve(e){var d=new Date(e.data+'T12:00:00');return d.getDate()+' '+MESI[d.getMonth()]+' '+d.getFullYear()+(e.fine&&e.fine!==e.data?' → '+new Date(e.fine+'T12:00:00').getDate()+' '+MESI[new Date(e.fine+'T12:00:00').getMonth()]:'');}

  fetch('/data/prenotazioni.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(c){
    API=String(c.api||'').replace(/\/+$/,'');
    if(!API){box.innerHTML='<p class="avviso-modulo">Il motore degli eventi non è ancora collegato.</p>';return;}
    PWD=leggi('gp'); PWD?elenco():accesso();
  });

  function accesso(msg){
    box.innerHTML='<form class="modulo accesso"><label>Password<input type="password" name="p" autocomplete="current-password" required></label>'+
      (msg?'<p class="errore-modulo" role="alert">'+esc(msg)+'</p>':'')+'<button class="bottone bottone-pieno">Entra</button></form>';
    box.querySelector('form').addEventListener('submit',function(e){e.preventDefault();PWD=this.p.value;elenco();});
    box.querySelector('input').focus();
  }

  // ---------- elenco ----------
  function elenco(){
    chiamata('GET','/admin/eventi').then(function(l){salva('gp',PWD);eventi=l;disegnaElenco();})
      .catch(function(e){if(e.status===401){salva('gp','');PWD='';accesso('Password non corretta.');}else box.innerHTML='<p class="errore-modulo">'+esc(e.message)+'</p>';});
  }
  function etichette(e){
    var t=[];
    t.push('<span class="stato stato-'+e.stato+'">'+({bozza:'Bozza',pubblicato:'Pubblicato',chiuso:'Chiuso'})[e.stato]+'</span>');
    if(e.in_evidenza&&!passato(e)) t.push('<span class="stato stato-evidenza">In primo piano</span>');
    if(e.pren_attive) t.push('<span class="stato stato-pren">Prenotazioni '+(e.aperte?'aperte':'chiuse')+(e.persone?': '+e.persone+' persone':'')+'</span>');
    return t.join(' ');
  }
  function riga(e){
    return '<li class="riga-evento">'+
      (e.locandina?'<img class="mini" src="'+esc(API+'/locandine/'+e.id+'?v='+e.locandina_ver)+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<span class="mini vuota"></span>')+
      '<div class="riga-testo"><p class="riga-data">'+esc(dataBreve(e))+'</p><h3>'+esc(e.titolo)+'</h3><p>'+etichette(e)+'</p></div>'+
      '<div class="riga-azioni"><button type="button" class="bottone" data-a="modifica" data-id="'+esc(e.id)+'">Modifica</button>'+
      '<button type="button" class="link-azione" data-a="duplica" data-id="'+esc(e.id)+'">Duplica</button>'+
      (e.pren_attive?'<a class="link-azione" href="/gestione-prenotazioni.html">Prenotazioni</a>':'')+
      (!e.prenotazioni?'<button type="button" class="link-azione" data-a="elimina" data-id="'+esc(e.id)+'">Elimina</button>':'')+
      '</div></li>';
  }
  function disegnaElenco(){
    var bozze=eventi.filter(function(e){return e.stato==='bozza';});
    var futuri=eventi.filter(function(e){return e.stato==='pubblicato'&&!passato(e);}).sort(function(a,b){return a.data<b.data?-1:1;});
    var vecchi=eventi.filter(function(e){return e.stato!=='bozza'&&passato(e);});
    function gruppo(t,l,v){return '<section class="gruppo"><h2>'+t+' <small>'+l.length+'</small></h2>'+(l.length?'<ul class="righe-eventi">'+l.map(riga).join('')+'</ul>':'<p class="vuoto">'+v+'</p>')+'</section>';}
    box.innerHTML=(avviso?'<p class="esito-ok" role="status">'+esc(avviso)+'</p>':'')+
      '<p><button type="button" class="bottone bottone-pieno" data-a="nuovo">Nuovo evento</button></p>'+
      gruppo('In programma sul sito',futuri,'Nessun evento pubblicato in programma.')+
      gruppo('Bozze',bozze,'Nessuna bozza. Le bozze sono visibili solo qui.')+
      gruppo('Passati e chiusi',vecchi,'Nessun evento passato.')+
      '<p class="gestione-esci"><button type="button" class="link-esci">Esci</button></p>';
    avviso='';
    box.querySelector('.link-esci').onclick=function(){salva('gp','');PWD='';accesso();};
    box.querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){
      var a=b.dataset.a, id=b.dataset.id;
      if(a==='nuovo') return editor(null);
      if(a==='modifica') return chiamata('GET','/admin/eventi/'+id).then(function(e){editor(e,false);}).catch(errore);
      if(a==='duplica') return chiamata('GET','/admin/eventi/'+id).then(function(e){editor(e,true);}).catch(errore);
      if(a==='elimina'){
        if(b.dataset.conferma!=='1'){b.dataset.conferma='1';b.textContent='Conferma eliminazione';b.classList.add('attenzione');return;}
        chiamata('DELETE','/admin/eventi/'+id).then(function(){avviso='Evento eliminato.';elenco();}).catch(errore);
      }
    };});
  }
  function errore(e){avviso='';var p=box.querySelector('.errore-modulo')||document.createElement('p');p.className='errore-modulo';p.setAttribute('role','alert');p.textContent=e.message;box.prepend(p);window.scrollTo(0,box.offsetTop-20);}

  // ---------- editor ----------
  function editor(e,duplica){
    var nuovo=!e||duplica;
    e=e||{stato:'bozza',luogo:LUOGO,pren_posti:15,pren_max:10};
    var f=e.pren_fasce, aOrari=!!(f&&f.dalle), elenco0=Array.isArray(f)?f.join(', '):'';
    var file=null, togliLocandina=false;
    box.innerHTML='<p><button type="button" class="link-azione indietro">Torna all\'elenco</button></p>'+
      '<h2>'+(duplica?'Duplica evento':nuovo?'Nuovo evento':'Modifica evento')+'</h2>'+
      (duplica?'<p class="nota-modulo">Copia di «'+esc(e.titolo)+'». Imposta la nuova data; la locandina va ricaricata.</p>':'')+
      '<form class="modulo modulo-evento" novalidate>'+
      '<div class="campi">'+
        '<label class="lungo">Titolo<input name="titolo" required maxlength="120" value="'+esc(e.titolo||'')+'"></label>'+
        '<label>Data<input name="data" type="date" required value="'+esc(duplica?'':e.data||'')+'"></label>'+
        '<label>Data di fine <span class="facoltativo">(se dura più giorni)</span><input name="fine" type="date" value="'+esc(duplica?'':e.fine||'')+'"></label>'+
        '<label>Orario<input name="orario" maxlength="160" placeholder="Es. dalle 17:00 alle 24:00" value="'+esc(e.orario||'')+'"></label>'+
        '<label>Luogo<input name="luogo" maxlength="160" value="'+esc(e.luogo||'')+'"></label>'+
      '</div>'+
      '<label class="lungo">Descrizione <span class="facoltativo">(una riga vuota separa i paragrafi)</span><textarea name="descrizione" rows="6" maxlength="3000">'+esc(e.descrizione||'')+'</textarea></label>'+
      '<label class="lungo">Avviso <span class="facoltativo">(in corsivo: prenotazione obbligatoria, consigli…)</span><textarea name="avviso" rows="2" maxlength="600">'+esc(e.avviso||'')+'</textarea></label>'+

      '<fieldset class="blocco"><legend>Locandina</legend>'+
        '<div class="locandina-campo"><div class="anteprima">'+(!duplica&&e.locandina?'<img src="'+esc(API+'/locandine/'+e.id+'?v='+Date.now())+'" alt="Locandina attuale">':'<span>Nessuna locandina</span>')+'</div>'+
        '<div><label>Scegli un\'immagine (JPG, PNG o WebP)<input type="file" name="locandina" accept="image/jpeg,image/png,image/webp"></label>'+
        (!duplica&&e.locandina?'<p><button type="button" class="link-azione togli-locandina">Togli la locandina</button></p>':'')+
        '<p class="nota-modulo">L\'immagine viene ridotta da sola a una dimensione adatta al sito.</p></div></div>'+
      '</fieldset>'+

      '<fieldset class="blocco"><legend>Pubblicazione</legend>'+
        '<div class="scelte">'+['bozza','pubblicato','chiuso'].map(function(s){
          var d={bozza:['Bozza','visibile solo qui'],pubblicato:['Pubblicato','visibile sul sito'],chiuso:['Chiuso','va tra gli eventi passati e chiude le prenotazioni']}[s];
          return '<label class="scelta"><input type="radio" name="stato" value="'+s+'"'+((duplica?'bozza':e.stato)===s?' checked':'')+'><span><strong>'+d[0]+'</strong> '+d[1]+'</span></label>';}).join('')+'</div>'+
        '<label class="spunta"><input type="checkbox" name="in_evidenza"'+(e.in_evidenza&&!duplica?' checked':'')+'><span>In primo piano nella pagina Eventi <span class="facoltativo">(se nessuno è segnato, va in primo piano il prossimo in calendario)</span></span></label>'+
      '</fieldset>'+

      '<fieldset class="blocco"><legend>Prenotazioni online</legend>'+
        '<label class="spunta"><input type="checkbox" name="pren_attive"'+(e.pren_attive?' checked':'')+'><span>Attiva le prenotazioni online per questo evento</span></label>'+
        '<div class="pren-dettagli"'+(e.pren_attive?'':' hidden')+'>'+
          '<div class="scelte">'+
            '<label class="scelta"><input type="radio" name="modo" value="orari"'+(aOrari||!elenco0?' checked':'')+'><span><strong>Partenze a orari</strong> gruppi a intervalli regolari</span></label>'+
            '<label class="scelta"><input type="radio" name="modo" value="elenco"'+(elenco0?' checked':'')+'><span><strong>Orari a scelta</strong> elenco libero di orari</span></label>'+
            '<label class="scelta"><input type="radio" name="modo" value="unica"'+(e.pren_attive&&!f?' checked':'')+'><span><strong>Senza orari</strong> un\'unica lista per l\'evento</span></label>'+
          '</div>'+
          '<div class="campi modo-orari">'+
            '<label>Prima partenza<input name="dalle" type="time" value="'+esc(aOrari?f.dalle:'17:00')+'"></label>'+
            '<label>Ultima partenza<input name="alle" type="time" value="'+esc(aOrari?f.alle:'23:30')+'"></label>'+
            '<label>Ogni quanti minuti<input name="ogni" type="number" min="5" max="600" value="'+esc(aOrari?f.ogni:30)+'"></label>'+
          '</div>'+
          '<label class="lungo modo-elenco">Orari, separati da virgola<input name="elenco" placeholder="15:00, 16:30, 18:00" value="'+esc(elenco0)+'"></label>'+
          '<div class="campi">'+
            '<label><span class="etichetta-posti">Posti per ogni partenza</span><input name="pren_posti" type="number" min="1" max="2000" value="'+esc(e.pren_posti||15)+'"></label>'+
            '<label>Massimo persone per prenotazione<input name="pren_max" type="number" min="1" max="2000" value="'+esc(e.pren_max||10)+'"></label>'+
            '<label class="lungo">Chiusura prenotazioni <span class="facoltativo">(vuoto = fino al giorno dell\'evento)</span><input name="pren_chiusura" type="datetime-local" value="'+esc(e.pren_chiusura||'')+'"></label>'+
          '</div>'+
        '</div>'+
      '</fieldset>'+

      '<p class="errore-modulo" role="alert" hidden></p>'+
      '<p class="evento-azioni"><button class="bottone bottone-pieno" type="submit">Salva</button> <button type="button" class="bottone indietro">Annulla</button></p>'+
      '</form>';

    var form=box.querySelector('form'), err=form.querySelector('.errore-modulo');
    box.querySelectorAll('.indietro').forEach(function(b){b.onclick=disegnaElenco;});
    function aggiornaModo(){
      var on=form.pren_attive.checked, modo=form.modo.value;
      form.querySelector('.pren-dettagli').hidden=!on;
      form.querySelector('.modo-orari').hidden=modo!=='orari';
      form.querySelector('.modo-elenco').hidden=modo!=='elenco';
      form.querySelector('.etichetta-posti').textContent=modo==='unica'?'Posti totali':'Posti per ogni partenza';
    }
    form.pren_attive.onchange=aggiornaModo; form.querySelectorAll('input[name=modo]').forEach(function(r){r.onchange=aggiornaModo;}); aggiornaModo();
    form.locandina.onchange=function(){
      var f0=this.files[0]; if(!f0) return;
      riduci(f0).then(function(b){file=b;togliLocandina=false;form.querySelector('.anteprima').innerHTML='<img src="'+URL.createObjectURL(b)+'" alt="Nuova locandina">';})
        .catch(function(){err.textContent='Non riesco a leggere questa immagine. Prova con un JPG o un PNG.';err.hidden=false;});
    };
    var tl=form.querySelector('.togli-locandina');
    if(tl) tl.onclick=function(){togliLocandina=true;file=null;form.locandina.value='';form.querySelector('.anteprima').innerHTML='<span>La locandina verrà tolta al salvataggio</span>';};

    form.addEventListener('submit',function(ev){
      ev.preventDefault(); err.hidden=true;
      var modo=form.modo.value, fasce=null;
      if(form.pren_attive.checked){
        if(modo==='orari') fasce={dalle:form.dalle.value,alle:form.alle.value,ogni:Number(form.ogni.value)};
        if(modo==='elenco'){fasce=form.elenco.value.split(/[,;\s]+/).map(function(x){return x.trim().replace('.',':');}).filter(Boolean).map(function(x){return /^\d:\d\d$/.test(x)?'0'+x:x;});
          if(!fasce.length||fasce.some(function(x){return !/^([01]\d|2[0-3]):[0-5]\d$/.test(x);})){err.textContent='Scrivi gli orari nel formato 17:00, separati da virgola.';err.hidden=false;return;}}
      }
      var dati={titolo:form.titolo.value,data:form.data.value,fine:form.fine.value,orario:form.orario.value,luogo:form.luogo.value,
        descrizione:form.descrizione.value,avviso:form.avviso.value,stato:form.stato.value,in_evidenza:form.in_evidenza.checked,
        pren_attive:form.pren_attive.checked,pren_fasce:fasce,pren_posti:Number(form.pren_posti.value),pren_max:Number(form.pren_max.value),pren_chiusura:form.pren_chiusura.value};
      if(!dati.titolo.trim()||!dati.data){err.textContent='Titolo e data sono obbligatori.';err.hidden=false;return;}
      var btn=form.querySelector('[type=submit]'); btn.disabled=true; btn.textContent='Salvataggio…';
      var salvataggio=nuovo?chiamata('POST','/admin/eventi',dati):chiamata('PUT','/admin/eventi/'+e.id,dati);
      salvataggio.then(function(r){
        var id=r.id;
        if(file) return chiamata('PUT','/admin/eventi/'+id+'/locandina',file,file.type);
        if(togliLocandina) return chiamata('DELETE','/admin/eventi/'+id+'/locandina');
      }).then(function(){
        avviso=dati.stato==='pubblicato'?'Salvato: l\'evento è visibile sul sito.':dati.stato==='chiuso'?'Salvato: l\'evento è tra i passati.':'Salvato come bozza.';
        elenco(); window.scrollTo(0,0);
      }).catch(function(x){err.textContent=x.message;err.hidden=false;btn.disabled=false;btn.textContent='Salva';});
    });
    window.scrollTo(0,0);
  }

  // Riduce l'immagine a massimo 1400 px sul lato lungo, in JPEG
  function riduci(f0){
    return new Promise(function(ok,ko){
      var img=new Image(); img.onerror=ko;
      img.onload=function(){
        var s=Math.min(1,1400/Math.max(img.width,img.height)), c=document.createElement('canvas');
        c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
        var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
        c.toBlob(function(b){b?ok(b):ko();},'image/jpeg',0.86);
      };
      img.src=URL.createObjectURL(f0);
    });
  }
})();
