/* VersoPro · site de vendas (não precisa editar: as opções ficam em config.js) */
(function(){
  "use strict";
  var C = window.VERSOPRO_SITE || {};
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var limpo = function(v){ return String(v || "").trim(); };
  document.documentElement.classList.add("js");

  /* ---------- links: comprar, WhatsApp, e-mail, download ---------- */
  var zap = limpo(C.whatsapp).replace(/\D/g, "");
  var zapUrl = zap ? "https://wa.me/" + zap + "?text=" + encodeURIComponent("Olá! Quero saber mais sobre o VersoPro.") : "";
  var compra = limpo(C.linkCompra);

  $$("[data-comprar]").forEach(function(a){
    if (compra){ a.href = compra; a.target = "_blank"; a.rel = "noopener"; }
    else if (zapUrl){ a.href = zapUrl.replace(encodeURIComponent("saber mais sobre"), encodeURIComponent("comprar")); a.target = "_blank"; a.rel = "noopener"; }
    else { a.href = "#preco"; }
  });
  if (zapUrl) $$("[data-whats]").forEach(function(a){ a.href = zapUrl; a.target = "_blank"; a.rel = "noopener"; a.hidden = false; });
  if (limpo(C.email)) $$("[data-email]").forEach(function(a){ a.href = "mailto:" + limpo(C.email); a.textContent = limpo(C.email); a.hidden = false; });
  if (limpo(C.linkDownload)) $$("[data-download]").forEach(function(a){ a.href = limpo(C.linkDownload); a.hidden = false; });

  /* ---------- preço ---------- */
  var p = $("#valor"), pa = $("#precoAntigo"), pc = $("#parcelas");
  if (limpo(C.preco)){ p.textContent = limpo(C.preco); }
  else { p.classList.add("vazio"); }
  if (limpo(C.precoAntigo)){ pa.textContent = limpo(C.precoAntigo); pa.hidden = false; }
  if (limpo(C.parcelas)){ pc.textContent = limpo(C.parcelas); pc.hidden = false; }
  var ano = $("#ano"); if (ano) ano.textContent = new Date().getFullYear();

  /* ---------- vídeo de demonstração ---------- */
  var v = limpo(C.video), caixa = $("#videoCaixa"), espera = $("#videoEspera"), aviso = $("#videoAviso");
  function idYoutube(u){
    var m = u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
    return m ? m[1] : "";
  }
  if (v){
    aviso.textContent = "Assista à demonstração";
    $("#videoPlay").addEventListener("click", function(){
      var yt = idYoutube(v), el;
      if (yt){
        el = document.createElement("iframe");
        el.src = "https://www.youtube-nocookie.com/embed/" + yt + "?autoplay=1&rel=0&modestbranding=1";
        el.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        el.allowFullscreen = true;
        el.title = "Demonstração do VersoPro";
      } else {
        el = document.createElement("video");
        el.src = v; el.controls = true; el.autoplay = true; el.playsInline = true;
      }
      espera.remove();
      caixa.appendChild(el);
    });
  } else {
    espera.classList.add("sem");
    $("#videoPlay").setAttribute("aria-label", "Vídeo de demonstração em breve");
  }

  /* ---------- carrosséis de slides (telão do topo e espera do vídeo) ---------- */
  function carrossel(box, tempo){
    if (!box) return;
    var imgs = $$("img", box), i = 0;
    if (imgs.length < 2) return;
    setInterval(function(){
      if (document.hidden) return;
      imgs[i].classList.remove("on");
      i = (i + 1) % imgs.length;
      imgs[i].classList.add("on");
      var tg = imgs[i].getAttribute("data-tag"), ch = document.getElementById("chipTag");
      if (tg && ch) ch.textContent = tg;
    }, tempo);
  }
  var calmo = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  carrossel($("#telao"), calmo ? 6000 : 3400);
  carrossel($(".video-slides"), calmo ? 6000 : 3000);

  /* ---------- topo com fundo ao rolar ---------- */
  var topo = $("#topo");
  function rolou(){ topo.classList.toggle("rolou", window.scrollY > 20); }
  window.addEventListener("scroll", rolou, { passive: true }); rolou();

  /* ---------- revelar ao rolar ---------- */
  var alvos = $$(".rv").concat($$(".hero-cena"));
  // atraso em cascata para itens irmãos
  $$(".cards, .passos, .faq, .cel-itens, .hero-txt").forEach(function(g){
    $$(".rv", g).forEach(function(el, k){ el.style.setProperty("--d", (k * 0.08) + "s"); });
  });
  if ("IntersectionObserver" in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add("vis"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    alvos.forEach(function(el){ io.observe(el); });
  } else {
    alvos.forEach(function(el){ el.classList.add("vis"); });
  }

  /* ---------- telão acompanha o mouse ---------- */
  var cena = $("#cena"), telao = cena && $(".telao", cena);
  if (cena && !calmo && window.matchMedia("(pointer:fine)").matches){
    cena.addEventListener("mousemove", function(e){
      var r = cena.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      telao.style.transform = "rotateY(" + (-9 + x * 10).toFixed(2) + "deg) rotateX(" + (3 - y * 8).toFixed(2) + "deg)";
    });
    cena.addEventListener("mouseleave", function(){ telao.style.transform = ""; });
  }

  /* ---------- brilho que segue o mouse nos cards ---------- */
  $$(".card").forEach(function(c){
    c.addEventListener("mousemove", function(e){
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* ---------- FAQ: abre um de cada vez ---------- */
  /* ---------- pausa animações fora da tela (deixa a rolagem leve) ---------- */
  if ("IntersectionObserver" in window){
    var ioP = new IntersectionObserver(function(es){
      es.forEach(function(e){ e.target.classList.toggle("parado", !e.isIntersecting); });
    }, { rootMargin: "100px 0px" });
    $$(".hero, .sec, .final").forEach(function(el){ ioP.observe(el); });
  }

  var faqs = $$(".faq details");
  faqs.forEach(function(d){
    d.addEventListener("toggle", function(){ if (d.open) faqs.forEach(function(o){ if (o !== d) o.open = false; }); });
  });
})();
