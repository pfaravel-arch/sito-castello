// Menu su telefono
(function(){
  var b=document.querySelector('.menu-apri'), m=document.getElementById('menu');
  if(!b||!m) return;
  b.addEventListener('click',function(){
    var aperto=m.classList.toggle('aperto');
    b.setAttribute('aria-expanded',aperto?'true':'false');
  });
})();

// Eventi: letti dal motore (/calendario, gestiti dall'area riservata); se non risponde, da /data/eventi.json.
// Dove c'e' [data-eventi]: "primo-piano" | "prossimi" | "passati"; data-limite="3"; data-escludi-primo="1".
(function(){
  var box=document.querySelectorAll('[data-eventi]');
  if(!box.length) return;
  var MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var GIORNI=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function paragrafi(t,cls){return String(t||'').split(/\n\s*\n/).filter(function(x){return x.trim();}).map(function(x){return '<p'+(cls?' class="'+cls+'"':'')+'>'+esc(x.trim()).replace(/\n/g,'<br>')+'</p>';}).join('');}
  function giornoDi(d){return new Date(d+'T12:00:00');}
  function dataLunga(e){
    var a=giornoDi(e.data), t=GIORNI[a.getDay()]+' '+a.getDate()+' '+MESI[a.getMonth()]+' '+a.getFullYear();
    if(e.fine&&e.fine!==e.data){var b=giornoDi(e.fine);t='dal '+a.getDate()+' '+MESI[a.getMonth()]+(a.getFullYear()!==b.getFullYear()?' '+a.getFullYear():'')+' al '+b.getDate()+' '+MESI[b.getMonth()]+' '+b.getFullYear();}
    return t;
  }
  var oggi=new Date(); oggi.setHours(0,0,0,0);
  function passato(e){return e.stato==='chiuso'||new Date((e.fine||e.data)+'T23:59:59')<oggi;}
  function prenotabile(e){return e.prenotazioni&&(e.prenotazioni.aperte===true||(e.prenotazioni.aperte===undefined&&e.prenotazioni.id))&&!passato(e);}
  function pulsanti(e,contatti){
    if(prenotabile(e)) return '<p class="evento-azioni"><a class="bottone bottone-pieno" href="/prenota.html?evento='+encodeURIComponent(e.id||e.prenotazioni.id)+'">Prenota online</a></p>';
    if(!contatti) return '';
    var ogg=encodeURIComponent('Informazioni: '+e.titolo);
    return '<p class="evento-azioni"><a class="bottone" href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=castellodisilvanopietra@gmail.com&amp;su='+ogg+'" target="_blank" rel="noopener">Scrivici con Gmail</a> '+
      '<a class="bottone" href="https://wa.me/393513479312?text='+encodeURIComponent('Ciao, vorrei informazioni su '+e.titolo)+'" rel="noopener">WhatsApp</a></p>'+
      '<p class="nota-modulo">Oppure <a href="mailto:castellodisilvanopietra@gmail.com?subject='+ogg+'">castellodisilvanopietra@gmail.com</a>, 351 347 9312.</p>';
  }
  function locandina(e,cls){
    return e.locandina?'<a class="'+cls+'" href="'+esc(e.locandina)+'" target="_blank" rel="noopener"><img src="'+esc(e.locandina)+'" alt="Locandina: '+esc(e.titolo)+'" loading="lazy"></a>':'';
  }
  function dettagli(e){return '<p class="dettagli">'+[dataLunga(e),e.orario,e.luogo].filter(Boolean).map(esc).join('<br>')+'</p>';}

  function primoPiano(e){
    return '<article class="primo-piano'+(e.locandina?'':' senza-locandina')+'">'+locandina(e,'primo-piano-locandina')+
      '<div class="primo-piano-testo"><p class="sopratitolo">'+(prenotabile(e)?'Prenotazioni aperte':'In programma')+'</p><h2>'+esc(e.titolo)+'</h2>'+dettagli(e)+
      paragrafi(e.descrizione)+(e.avviso?paragrafi(e.avviso,'avviso'):'')+pulsanti(e,true)+'</div></article>';
  }
  function scheda(e){
    var d=giornoDi(e.data), loc=locandina(e,'evento-locandina');
    return '<article class="evento'+(loc?' con-locandina':'')+'"><div class="evento-data"><span class="giorno">'+d.getDate()+'</span><span class="mese">'+MESI[d.getMonth()]+' '+d.getFullYear()+'</span></div>'+
      '<div><h3>'+esc(e.titolo)+'</h3>'+dettagli(e)+paragrafi(e.descrizione)+(e.avviso?paragrafi(e.avviso,'avviso'):'')+pulsanti(e,false)+'</div>'+loc+'</article>';
  }
  function archivio(e){
    return '<article class="evento-passato">'+(e.locandina?locandina(e,'passato-locandina'):'<div class="passato-locandina vuota" aria-hidden="true"></div>')+
      '<h3>'+esc(e.titolo)+'</h3><p class="dettagli">'+esc(dataLunga(e))+'</p></article>';
  }

  function carica(){
    return fetch('/data/prenotazioni.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(c){
      var api=String(c.api||'').replace(/\/+$/,''); if(!api) throw new Error('motore assente');
      return fetch(api+'/calendario').then(function(r){if(!r.ok) throw new Error(r.status);return r.json();});
    }).catch(function(){
      return fetch('/data/eventi.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(l){
        return l.map(function(e){e.stato=e.stato||'pubblicato';e.id=e.id||(e.prenotazioni&&e.prenotazioni.id);return e;});
      });
    });
  }

  carica().then(function(lista){
    var futuri=lista.filter(function(e){return !passato(e);}).sort(function(a,b){return a.data<b.data?-1:1;});
    var vecchi=lista.filter(passato).sort(function(a,b){return a.data<b.data?1:-1;});
    var primo=futuri.filter(function(e){return e.in_evidenza;})[0]||futuri[0]||null;
    box.forEach(function(el){
      var tipo=el.getAttribute('data-eventi')||'prossimi', lim=parseInt(el.getAttribute('data-limite')||'0',10);
      var vuoto=el.getAttribute('data-vuoto')||'Nuovi appuntamenti in arrivo: seguici sui social per saperlo per primo.';
      if(tipo==='primo-piano'){
        var sez=el.closest('[data-sezione]');
        if(!primo){el.innerHTML=''; if(sez) sez.hidden=true; return;}
        if(sez) sez.hidden=false; el.innerHTML=primoPiano(primo); return;
      }
      var sel=tipo==='passati'?vecchi:futuri.filter(function(e){return !(el.getAttribute('data-escludi-primo')&&e===primo);});
      if(lim) sel=sel.slice(0,lim);
      var sezione=el.closest('[data-sezione]');
      if(!sel.length&&sezione&&el.getAttribute('data-nascondi-vuoto')){sezione.hidden=true;return;}
      if(sezione) sezione.hidden=false;
      el.innerHTML=sel.length?(tipo==='passati'?'<div class="archivio">'+sel.map(archivio).join('')+'</div>':sel.map(scheda).join('')):'<p class="eventi-vuoto">'+esc(vuoto)+'</p>';
    });
  }).catch(function(){
    box.forEach(function(el){el.innerHTML='<p class="eventi-vuoto">Il calendario non si è caricato. Ricarica la pagina o scrivici a castellodisilvanopietra@gmail.com.</p>';});
  });
})();
