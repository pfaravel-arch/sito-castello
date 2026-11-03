// Area riservata: il contenuto sta cifrato in /data/area-riservata.json (AES-GCM, chiave PBKDF2
// dalla password). Senza la password giusta non e' leggibile. Vedi strumenti/cifra_area.py.
(function(){
  var box=document.getElementById('area'), form=document.getElementById('area-accesso');
  if(!box||!form) return;
  var err=form.querySelector('.errore-modulo'), btn=form.querySelector('button');
  var b64=function(s){return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0);});};
  function leggi(){try{return sessionStorage.getItem('ak')||'';}catch(e){return '';}}
  function salva(v){try{v?sessionStorage.setItem('ak',v):sessionStorage.removeItem('ak');}catch(e){}}
  var dati=fetch('/data/area-riservata.json',{cache:'no-cache'}).then(function(r){return r.json();});

  function apri(chiaveRaw){
    return Promise.all([dati,crypto.subtle.importKey('raw',chiaveRaw,'AES-GCM',false,['decrypt'])]).then(function(x){
      var d=x[0];
      return crypto.subtle.decrypt({name:'AES-GCM',iv:b64(d.iv)},x[1],b64(d.dati));
    }).then(function(chiaro){
      box.innerHTML=new TextDecoder().decode(chiaro)+'<p class="gestione-esci"><button type="button" class="link-esci">Esci</button></p>';
      box.querySelector('.link-esci').onclick=function(){salva('');location.reload();};
    });
  }
  function deriva(password){
    return dati.then(function(d){
      return crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']).then(function(k){
        return crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:b64(d.sale),iterations:d.iter},k,256);
      });
    });
  }

  var salvata=leggi();
  if(salvata) apri(b64(salvata)).catch(function(){salva('');});

  form.addEventListener('submit',function(e){
    e.preventDefault(); err.hidden=true; btn.disabled=true; btn.textContent='Verifica…';
    deriva(form.p.value).then(function(bits){
      var raw=new Uint8Array(bits);
      return apri(raw).then(function(){salva(btoa(String.fromCharCode.apply(null,raw)));});
    }).catch(function(){
      err.textContent='Password non corretta.'; err.hidden=false; btn.disabled=false; btn.textContent='Entra'; form.p.select();
    });
  });
})();
