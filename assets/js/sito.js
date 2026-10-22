// Menu su telefono
(function(){
  var b=document.querySelector('.menu-apri'), m=document.getElementById('menu');
  if(!b||!m) return;
  b.addEventListener('click',function(){
    var aperto=m.classList.toggle('aperto');
    b.setAttribute('aria-expanded',aperto?'true':'false');
  });
})();

// Eventi: letti da /data/eventi.json e mostrati dove c'è [data-eventi]
// Attributi: data-eventi="prossimi" | "passati", data-limite="3"
(function(){
  var box=document.querySelectorAll('[data-eventi]');
  if(!box.length) return;
  var MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function scheda(e){
    var d=new Date(e.data+'T12:00:00');
    var link=e.link?'<a class="bottone" href="'+esc(e.link)+'">'+esc(e.etichetta_link||'Scopri di più')+'</a>':'';
    var loc=e.locandina?'<a class="evento-locandina" href="'+esc(e.locandina)+'" target="_blank" rel="noopener"><img src="'+esc(e.locandina)+'" alt="Locandina: '+esc(e.titolo)+'" loading="lazy"></a>':'';
    return '<article class="evento'+(loc?' con-locandina':'')+'"><div class="evento-data"><span class="giorno">'+d.getDate()+'</span><span class="mese">'+MESI[d.getMonth()]+' '+d.getFullYear()+'</span></div>'+
      '<div><h3>'+esc(e.titolo)+'</h3>'+
      (e.orario||e.luogo?'<p class="dettagli">'+esc([e.orario,e.luogo].filter(Boolean).join(', '))+'</p>':'')+
      '<p>'+esc(e.descrizione)+'</p>'+
      (e.avviso?'<p class="avviso">'+esc(e.avviso)+'</p>':'')+link+'</div>'+loc+'</article>';
  }
  fetch('/data/eventi.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(lista){
    var oggi=new Date(); oggi.setHours(0,0,0,0);
    box.forEach(function(el){
      var tipo=el.getAttribute('data-eventi')||'prossimi';
      var lim=parseInt(el.getAttribute('data-limite')||'0',10);
      var sel=lista.filter(function(e){
        var fine=new Date((e.fine||e.data)+'T23:59:59');
        return tipo==='passati'?fine<oggi:fine>=oggi;
      }).sort(function(a,b){return tipo==='passati'?(a.data<b.data?1:-1):(a.data>b.data?1:-1);});
      if(lim) sel=sel.slice(0,lim);
      el.innerHTML=sel.length?sel.map(scheda).join(''):'<p class="eventi-vuoto">'+esc(el.getAttribute('data-vuoto')||'Nuovi appuntamenti in arrivo: seguici sui social per saperlo per primo.')+'</p>';
    });
  }).catch(function(){
    box.forEach(function(el){el.innerHTML='<p class="eventi-vuoto">Il calendario non si è caricato. Ricarica la pagina o scrivici a info@castellodisilvanopietra.com.</p>';});
  });
})();
