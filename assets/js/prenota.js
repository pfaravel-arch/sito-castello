// Pagina /prenota.html?evento=ID: fasce orarie con posti liberi e modulo di prenotazione.
(function(){
  var box=document.getElementById('prenota'); if(!box) return;
  var id=new URLSearchParams(location.search).get('evento')||'';
  var MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var API='';
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function dataLunga(d){var x=new Date(d+'T12:00:00');return x.getDate()+' '+MESI[x.getMonth()]+' '+x.getFullYear();}
  // colore della fascia: verde finche' e' occupata meno della meta', giallo fino all'esaurimento, rosso se completa
  function livello(f){var tot=f.totale||f.liberi||1;return f.liberi<1?'piena':f.liberi>=tot/2?'libera':'quasi';}
  function postiTesto(f){return f.liberi<1?'completo':f.liberi+(f.liberi===1?' posto libero':' posti liberi');}
  function contatti(msg){
    box.innerHTML='<p class="avviso-modulo">'+esc(msg)+'</p><p>Puoi prenotare scrivendo a <a href="mailto:castellodisilvanopietra@gmail.com">castellodisilvanopietra@gmail.com</a> o su WhatsApp al <a href="https://wa.me/393513479312">351 347 9312</a>.</p>';
  }
  // chi e' entrato nell'area riservata puo' provare le prenotazioni sugli eventi in bozza
  var staff=''; try{staff=sessionStorage.getItem('gp')||'';}catch(e){}
  function chiamata(metodo,percorso,corpo){
    var h={'Content-Type':'application/json'}; if(staff) h['X-Password']=staff;
    return fetch(API+percorso,{method:metodo,headers:h,body:corpo?JSON.stringify(corpo):undefined})
      .then(function(r){return r.json().catch(function(){return{};}).then(function(d){if(!r.ok) throw new Error(d.errore||'Errore '+r.status);return d;});});
  }

  if(!id){contatti('Scegli un evento dalla pagina Eventi per prenotare.');return;}
  fetch('/data/prenotazioni.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(c){
    API=String(c.api||'').replace(/\/+$/,'');
    if(!API) throw new Error('non configurato');
    return chiamata('GET','/eventi/'+encodeURIComponent(id));
  }).then(mostra).catch(function(e){
    contatti(/non trovato/i.test(e.message)?'Questo evento non è prenotabile online.':'Le prenotazioni online non sono disponibili in questo momento.');
  });

  function mostra(ev){
    document.title='Prenota: '+ev.titolo+' | Castello di Silvano Pietra';
    var h=(ev.bozza?'<p class="avviso-prova">Prova: questo evento è in bozza e il pubblico non lo vede. Le prenotazioni fatte qui spariscono quando elimini la bozza.</p>':'')+'<p class="dettagli-evento">'+esc(dataLunga(ev.data))+(ev.luogo?', '+esc(ev.luogo):'')+'</p><h1>'+esc(ev.titolo)+'</h1>';
    if(!ev.aperte){contatti('Le prenotazioni online per questo evento sono chiuse.');box.insertAdjacentHTML('afterbegin',h);return;}
    var liberiTot=ev.fasce.reduce(function(s,f){return s+f.liberi;},0);
    if(!liberiTot){box.innerHTML=h+'<p class="avviso-modulo">Tutti i posti sono esauriti. Scrivici: se si libera un posto ti avvisiamo.</p>';return;}
    var unica=ev.fasce.length===1&&ev.fasce[0].ora==='unica';
    h+='<form class="modulo" novalidate>'+
      (unica?'<input type="hidden" name="fascia" value="unica">':
      '<fieldset class="turni"><legend>Scegli l\'orario di partenza</legend>'+ev.fasce.map(function(f){
        var off=f.liberi<1;
        return '<label class="turno '+livello(f)+'"><input type="radio" name="fascia" value="'+esc(f.ora)+'"'+(off?' disabled':'')+' required><span class="ora">'+esc(f.ora)+'</span><span class="posti">'+postiTesto(f)+'</span></label>';
      }).join('')+'<p class="legenda-turni"><span class="libera">posti liberi</span><span class="quasi">ultimi posti</span><span class="piena">completo</span></p></fieldset>')+
      '<div class="campi">'+
        '<label>Nome<input name="nome" autocomplete="given-name" required maxlength="60"></label>'+
        '<label>Cognome<input name="cognome" autocomplete="family-name" required maxlength="60"></label>'+
        '<label>E-mail<input name="email" type="email" autocomplete="email" maxlength="120"></label>'+
        '<label>Telefono<input name="telefono" type="tel" autocomplete="tel" maxlength="30"></label>'+
        '<label>Numero di persone<input name="persone" type="number" min="1" max="'+ev.max_per_prenotazione+'" value="1" required></label>'+
      '</div>'+
      '<label class="nascosto" aria-hidden="true">Sito web<input name="sito_web" tabindex="-1" autocomplete="off"></label>'+
      '<label class="consenso"><input type="checkbox" name="consenso" required><span>Acconsento al trattamento dei miei dati per gestire la prenotazione, come descritto nell\'<a href="/privacy.html" target="_blank">informativa privacy</a>.</span></label>'+
      '<p class="errore-modulo" role="alert" hidden></p>'+
      '<button class="bottone bottone-pieno" type="submit">Conferma la prenotazione</button>'+
      '<p class="nota-modulo">Lascia almeno un\'e-mail o un numero di telefono. La prenotazione è riservata ai soci dell\'associazione.</p>'+
    '</form>';
    box.innerHTML=h;
    var form=box.querySelector('form'), err=box.querySelector('.errore-modulo'), btn=form.querySelector('button');
    form.addEventListener('submit',function(e){
      e.preventDefault(); err.hidden=true;
      var f=new FormData(form);
      var dati={evento:id,fascia:f.get('fascia')||'',nome:f.get('nome'),cognome:f.get('cognome'),email:f.get('email'),telefono:f.get('telefono'),
        persone:Number(f.get('persone')),sito_web:f.get('sito_web'),consenso:form.consenso.checked};
      var problema=!dati.fascia?'Scegli un orario.':!dati.nome||!dati.cognome?'Inserisci nome e cognome.':
        !dati.email&&!dati.telefono?'Lascia almeno un\'e-mail o un numero di telefono.':!dati.consenso?'Serve il consenso al trattamento dei dati.':'';
      if(problema){err.textContent=problema;err.hidden=false;return;}
      btn.disabled=true; btn.textContent='Invio in corso…';
      chiamata('POST','/prenotazioni',dati).then(function(r){
        box.innerHTML='<div class="conferma"><p class="dettagli-evento">'+esc(dataLunga(r.data))+'</p><h1>Prenotazione confermata</h1>'+
          '<p class="introduzione">'+esc(r.titolo)+(r.fascia!=='unica'?', partenza alle '+esc(r.fascia):'')+', '+r.persone+(r.persone===1?' persona':' persone')+'.</p>'+
          '<p>Il tuo codice di prenotazione è</p><p class="codice">'+esc(r.codice)+'</p>'+
          (r.email_conferma?'<p>Ti abbiamo inviato una e-mail di conferma con tutti i dettagli: se non la trovi, controlla nello spam. Se non potrai più venire, nell\'e-mail trovi il link per annullare.</p>':'')+
          '<p>Annotalo o fai uno screenshot di questa pagina e mostralo all\'arrivo. Arriva con 15-30 minuti di anticipo rispetto all\'orario prenotato.</p>'+
          '<p>Per modificare o annullare scrivi a <a href="mailto:castellodisilvanopietra@gmail.com?subject=Prenotazione%20'+esc(r.codice)+'">castellodisilvanopietra@gmail.com</a> indicando il codice.</p></div>';
        window.scrollTo(0,box.offsetTop-20);
      }).catch(function(e2){
        err.textContent=e2.message; err.hidden=false; btn.disabled=false; btn.textContent='Conferma la prenotazione';
        chiamata('GET','/eventi/'+encodeURIComponent(id)).then(function(ev2){ // aggiorna i posti liberi
          ev2.fasce.forEach(function(x){var i=form.querySelector('input[name=fascia][value="'+x.ora+'"]');if(!i)return;var l=i.closest('.turno');
            l.querySelector('.posti').textContent=postiTesto(x);i.disabled=x.liberi<1;l.className='turno '+livello(x);if(i.disabled)i.checked=false;});
        }).catch(function(){});
      });
    });
  }
})();
