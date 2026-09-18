/* =========================================================
   AREN — App con multiusuario real (Supabase)
========================================================= */

const SUPABASE_URL = 'https://kimchxupqqxnjkmssbtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbWNoeHVwcXF4bmprbXNzYnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMzM1MzIsImV4cCI6MjEwNDkwOTUzMn0.nus6tR4eaeVrQNjG86epuABUS7f97QgRm7vLnZ58TXI';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usuarioActual = null;
let perfilActual = null;
let _historiasCache = [];
let edadUsuario = null;

const EDAD_MINIMA = 13;

/* =========================================================
   LISTAS DE GÉNEROS Y SUBGÉNEROS
========================================================= */
const GENEROS_PRINCIPALES = [
  'Romance', 'Fantasía', 'Ciencia Ficción', 'Misterio', 'Terror',
  'Aventura', 'Drama', 'Poesía', 'Histórico', 'Juvenil',
  'Fanfic', 'Humor', 'No ficción', 'Erótico', 'Espiritual',
  'Superhéroes', 'Vampírico', 'Zombis', 'Steampunk', 'Mitología',
  'Deportes', 'Música', 'Realeza', 'Distopía', 'Espías',
  'Magia', 'Ángeles y Demonios', 'Sirenas', 'Viajes en el tiempo', 'Supervivencia'
];

const SUBGENEROS = [
  'Acción', 'Comedia', 'Suspenso', 'Drama', 'Magia',
  'Romance', 'Terror', 'Misterio', 'Aventura', 'Fantasía',
  'Distopía', 'Post-apocalíptico', 'Sobrenatural', 'Psicológico', 'Histórico',
  'Juvenil', 'Adulto', 'Familiar', 'Amistad', 'Venganza',
  'Redención', 'Viaje', 'Guerra', 'Supervivencia', 'Academia',
  'Criaturas', 'Poderes', 'Profecías', 'Secretos', 'Traición',
  'Amor prohibido', 'Triángulo amoroso', 'Misterio escolar', 'Vidas pasadas', 'Reencarnación',
  'Héroes'
];

const MAX_SUBGENEROS = 3;

let generoSeleccionado = '';
let subgenerosSeleccionados = [];

/* =========================================================
   UTILIDADES
========================================================= */
function toast(mensaje, tipo = 'info', duracion = 3200) {
  const cont = document.getElementById('toastContainer');
  if (!cont) { alert(mensaje); return; }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  const iconos = { error: '⚠️ ', success: '✅ ', info: 'ℹ️ ', warn: '⚡ ' };
  t.textContent = (iconos[tipo] || '') + mensaje;
  cont.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, duracion);
}

const escapeHtml = t => {
  const d = document.createElement('div');
  d.textContent = t == null ? '' : t;
  return d.innerHTML;
};

function mostrarErrorCompleto(err, contexto = '') {
  let info = '';
  if (err === null || err === undefined) info = 'Error desconocido';
  else if (typeof err === 'string') info = err;
  else if (typeof err === 'object') {
    info = err.message || err.error_description || err.error || err.msg || err.hint || '';
    if (!info) { try { info = JSON.stringify(err); } catch (e) { info = String(err); } }
    if (err.code) info += ' [código: ' + err.code + ']';
    if (err.status) info += ' [status: ' + err.status + ']';
  } else info = String(err);
  toast((contexto ? contexto + ': ' : '') + info, 'error', 10000);
  console.error('🔍 ERROR [' + contexto + ']:', err);
}

/* =========================================================
   EDAD Y FECHAS
========================================================= */
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  if (isNaN(nac.getTime())) return null;
  let edad = hoy.getFullYear() - nac.getFullYear();
  const mesDiff = hoy.getMonth() - nac.getMonth();
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nac.getDate())) {
    edad--;
  }
  return edad;
}

function actualizarEdadUsuario(fechaNacimiento) {
  const anios = calcularEdad(fechaNacimiento);
  if (anios === null) {
    edadUsuario = null;
    return;
  }
  edadUsuario = { anios: anios, esMenor: anios < 18 };
}

function formatearMiembroDesde(fechaISO) {
  if (!fechaISO) return '';
  try {
    const d = new Date(fechaISO);
    const mes = d.toLocaleDateString('es-ES', { month: 'long' });
    return 'Miembro desde ' + mes + ' ' + d.getFullYear();
  } catch (e) {
    return '';
  }
}

/* =========================================================
   FILTRO POR EDAD
========================================================= */
function historiaEsAptaParaMi(h) {
  if (!edadUsuario || !edadUsuario.esMenor) return true;
  if (h.advertencias && h.advertencias.length > 0) return false;
  return true;
}

function filtrarHistoriasPorEdad(historias) {
  return historias.filter(historiaEsAptaParaMi);
}

/* =========================================================
   GRIDS DE GÉNEROS Y SUBGÉNEROS
========================================================= */
function renderizarGridGeneros() {
  const cont = document.getElementById('gridGeneros');
  if (!cont) return;
  cont.innerHTML = '';
  GENEROS_PRINCIPALES.forEach(g => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-genero' + (generoSeleccionado === g ? ' seleccionado' : '');
    btn.textContent = g;
    btn.onclick = () => {
      generoSeleccionado = (generoSeleccionado === g) ? '' : g;
      document.getElementById('genero').value = generoSeleccionado;
      renderizarGridGeneros();
      actualizarContadorGenero();
    };
    cont.appendChild(btn);
  });
}

function actualizarContadorGenero() {
  const cont = document.getElementById('contadorGenero');
  if (!cont) return;
  if (generoSeleccionado) {
    cont.textContent = '✓ ' + generoSeleccionado;
    cont.classList.add('completo');
  } else {
    cont.textContent = '(elige 1)';
    cont.classList.remove('completo');
  }
}

function renderizarGridSubgeneros() {
  const cont = document.getElementById('gridSubgeneros');
  if (!cont) return;
  cont.innerHTML = '';
  const lleno = subgenerosSeleccionados.length >= MAX_SUBGENEROS;
  SUBGENEROS.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const seleccionado = subgenerosSeleccionados.includes(s);
    btn.className = 'btn-genero' + (seleccionado ? ' seleccionado' : '');
    if (!seleccionado && lleno) btn.classList.add('deshabilitado');
    btn.textContent = s;
    btn.onclick = () => {
      if (seleccionado) {
        subgenerosSeleccionados = subgenerosSeleccionados.filter(x => x !== s);
      } else {
        if (subgenerosSeleccionados.length >= MAX_SUBGENEROS) {
          toast(`Máximo ${MAX_SUBGENEROS} subgéneros`, 'warn', 2000);
          return;
        }
        subgenerosSeleccionados.push(s);
      }
      renderizarGridSubgeneros();
      actualizarContadorSubgeneros();
    };
    cont.appendChild(btn);
  });
}

function actualizarContadorSubgeneros() {
  const cont = document.getElementById('contadorSubgeneros');
  if (!cont) return;
  const n = subgenerosSeleccionados.length;
  cont.textContent = `(${n}/${MAX_SUBGENEROS})`;
  if (n >= MAX_SUBGENEROS) cont.classList.add('completo');
  else cont.classList.remove('completo');
}

function resetearGrids() {
  generoSeleccionado = '';
  subgenerosSeleccionados = [];
  const inputGen = document.getElementById('genero');
  if (inputGen) inputGen.value = '';
  renderizarGridGeneros();
  renderizarGridSubgeneros();
  actualizarContadorGenero();
  actualizarContadorSubgeneros();
}

/* =========================================================
   CARRUSEL TOP 5 MÁS RECIENTES
========================================================= */
let carruselIdx = 0;
let carruselTimer = null;
let carruselHistorias = [];
let carruselPausado = false;

function iniciarCarrusel(historias) {
  const track = document.getElementById('carruselTrack');
  const dots = document.getElementById('carruselDots');
  const container = document.getElementById('carruselTop');
  if (!track || !dots || !container) return;

  detenerCarrusel();

  carruselHistorias = historias.slice(0, 5);
  if (!carruselHistorias.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  track.innerHTML = '';
  carruselHistorias.forEach(h => {
    const slide = document.createElement('div');
    slide.className = 'carrusel-slide';

    const subgeneros = (h.subgenero || []).slice(0, 2).join(' · ');
    const capTexto = h.capitulos.length > 0
      ? `${h.capitulos.length} capítulo${h.capitulos.length === 1 ? '' : 's'}`
      : 'Sin capítulos aún';

    slide.innerHTML = `
      <div class="carrusel-slide-portada">
        ${h.portadaUrl ? `<img src="${h.portadaUrl}" alt="">` : '📖'}
      </div>
      <div class="carrusel-slide-info">
        <h3>${escapeHtml(h.titulo)}</h3>
        <p class="autor-mini">por ${escapeHtml(h.autor || 'Anónimo')}</p>
        <p class="genero-mini">${escapeHtml(h.genero)}${subgeneros ? ' · ' + escapeHtml(subgeneros) : ''}</p>
        <p class="cap-mini">📖 ${capTexto}</p>
        ${h.sinopsis ? `<p class="sinopsis-mini">${escapeHtml(h.sinopsis)}</p>` : ''}
      </div>
    `;
    slide.onclick = () => abrirLector(h.id);
    track.appendChild(slide);
  });

  dots.innerHTML = '';
  carruselHistorias.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carrusel-dot' + (i === 0 ? ' activo' : '');
    dot.setAttribute('aria-label', `Ir a slide ${i + 1}`);
    dot.onclick = () => { irASlide(i); reiniciarTimerCarrusel(); };
    dots.appendChild(dot);
  });

  carruselIdx = 0;
  actualizarCarrusel();
  iniciarTimerCarrusel();

  container.onmouseenter = () => { carruselPausado = true; };
  container.onmouseleave = () => { carruselPausado = false; };
}

function iniciarTimerCarrusel() {
  detenerCarrusel();
  carruselTimer = setInterval(() => {
    if (carruselPausado) return;
    if (carruselHistorias.length <= 1) return;

    const ancho = window.innerWidth;
    const slidesVisibles = ancho >= 900 ? 3 : 1;
    const maxIdx = Math.max(0, carruselHistorias.length - slidesVisibles);

    if (carruselIdx >= maxIdx) {
      carruselIdx = 0;
    } else {
      carruselIdx++;
    }
    actualizarCarrusel();
  }, 5000);
}

function detenerCarrusel() {
  if (carruselTimer) {
    clearInterval(carruselTimer);
    carruselTimer = null;
  }
}

function reiniciarTimerCarrusel() {
  iniciarTimerCarrusel();
}

function irASlide(i) {
  if (!carruselHistorias.length) return;
  carruselIdx = Math.max(0, Math.min(i, carruselHistorias.length - 1));
  actualizarCarrusel();
}

function actualizarCarrusel() {
  const track = document.getElementById('carruselTrack');
  const dots = document.getElementById('carruselDots');
  if (!track) return;

  const ancho = window.innerWidth;
  let slidesVisibles = 1;
  if (ancho >= 900) slidesVisibles = 3;

  const total = carruselHistorias.length;

  // Calcular el máximo índice sin dejar vacíos
  const maxIdx = Math.max(0, total - slidesVisibles);
  if (carruselIdx > maxIdx) carruselIdx = maxIdx;
  if (carruselIdx < 0) carruselIdx = 0;

  const porcentaje = 100 / slidesVisibles;
  track.style.transform = `translateX(-${carruselIdx * porcentaje}%)`;

  if (dots) {
    [...dots.children].forEach((d, i) => {
      d.classList.toggle('activo', i === carruselIdx);
    });
  }
}

window.addEventListener('resize', actualizarCarrusel);

document.getElementById('carruselPrev')?.addEventListener('click', () => {
  if (!carruselHistorias.length) return;
  const ancho = window.innerWidth;
  const slidesVisibles = ancho >= 900 ? 3 : 1;
  const maxIdx = Math.max(0, carruselHistorias.length - slidesVisibles);
  carruselIdx = carruselIdx <= 0 ? maxIdx : carruselIdx - 1;
  actualizarCarrusel();
  reiniciarTimerCarrusel();
});

document.getElementById('carruselNext')?.addEventListener('click', () => {
  if (!carruselHistorias.length) return;
  const ancho = window.innerWidth;
  const slidesVisibles = ancho >= 900 ? 3 : 1;
  const maxIdx = Math.max(0, carruselHistorias.length - slidesVisibles);
  carruselIdx = carruselIdx >= maxIdx ? 0 : carruselIdx + 1;
  actualizarCarrusel();
  reiniciarTimerCarrusel();
});

/* =========================================================
   ALMACENAMIENTO LOCAL
========================================================= */
function userId() { return usuarioActual ? usuarioActual.id : 'anon'; }
function claveUsuario(base) { return base + '_' + userId(); }

const getBiblioteca = () => JSON.parse(localStorage.getItem(claveUsuario('aren_biblioteca')) || '[]');
const setBiblioteca = v => localStorage.setItem(claveUsuario('aren_biblioteca'), JSON.stringify(v));

const getHistorial = () => JSON.parse(localStorage.getItem(claveUsuario('aren_historial')) || '{}');
const setHistorial = v => localStorage.setItem(claveUsuario('aren_historial'), JSON.stringify(v));

const getSiguiendo = () => JSON.parse(localStorage.getItem(claveUsuario('aren_siguiendo')) || '[]');
const setSiguiendo = v => localStorage.setItem(claveUsuario('aren_siguiendo'), JSON.stringify(v));

const ajustesDefault = {
  tema: 'claro',
  color: 'azul',
  scrollInfinito: false,
  lectura: { tamano: 18, interlineado: 1.7, ancho: 700, familia: 'serif' }
};
const getAjustes = () => {
  const g = JSON.parse(localStorage.getItem(claveUsuario('aren_ajustes')) || '{}');
  return {
    ...ajustesDefault, ...g,
    lectura: { ...ajustesDefault.lectura, ...(g.lectura || {}) }
  };
};
const setAjustes = v => localStorage.setItem(claveUsuario('aren_ajustes'), JSON.stringify(v));

/* =========================================================
   INDEXEDDB
========================================================= */
const DB_NOMBRE = 'aren-datos';
const DB_VERSION = 2;
const STORE_IMG = 'portadas';
let idbPromise = null;

function abrirDB() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IMG)) db.createObjectStore(STORE_IMG);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function obtenerImagenDB(id) {
  try {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMG, 'readonly');
      const req = tx.objectStore(STORE_IMG).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return localStorage.getItem('aren_img_' + id);
  }
}

const cacheImagenes = {};
async function cargarImagenLocal(id, intentos = 4) {
  if (!id) return null;
  if (cacheImagenes[id] !== undefined && cacheImagenes[id] !== null) return cacheImagenes[id];
  for (let i = 0; i < intentos; i++) {
    try {
      const data = await obtenerImagenDB(id);
      if (data) { cacheImagenes[id] = data; return data; }
      if (i < intentos - 1) await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      if (i < intentos - 1) await new Promise(r => setTimeout(r, 250));
    }
  }
  return null;
}

/* =========================================================
   CONVERSIÓN SUPABASE ↔ APP
========================================================= */
function historiaDeSupabase(s) {
  if (!s) return null;
  return {
    id: s.id,
    supabaseId: s.id,
    user_id: s.user_id,
    titulo: s.title || '',
    autor: s.author || 'Anónimo',
    autorFoto: s.author_photo_url || null,
    sinopsis: s.synopsis || '',
    genero: s.genre || '',
    subgenero: Array.isArray(s.subgenre) ? s.subgenre : (s.subgenre ? [s.subgenre] : []),
    estado: s.status || 'En curso',
    etiquetas: s.tags || [],
    advertencias: s.warnings || [],
    dedicatoria: s.dedication || '',
    portadaUrl: s.cover_url || null,
    portadaId: null,
    esBorrador: s.is_draft || false,
    fechaPublicacion: s.publish_at || null,
    fecha: s.created_at,
    capitulos: [],
    valoraciones: [],
    comentarios: {},
  };
}

function capituloDeSupabase(c) {
  if (!c) return null;
  return {
    id: c.id,
    titulo: c.title || '',
    contenido: c.content || '',
    notaAutor: c.author_note || '',
    orden: c.chapter_order || 1,
  };
}

function historiaParaSupabase(h, incluirId = false) {
  const datos = {
    p_title: h.titulo || '',
    p_author: h.autor || 'Anónimo',
    p_author_photo_url: h.autorFoto || null,
    p_synopsis: h.sinopsis || '',
    p_genre: h.genero || '',
    p_subgenre: h.subgenero || [],
    p_status: h.estado || 'En curso',
    p_tags: h.etiquetas || [],
    p_warnings: h.advertencias || [],
    p_dedication: h.dedicatoria || '',
    p_cover_url: h.portadaUrl || null,
    p_is_draft: h.esBorrador || false,
    p_publish_at: h.fechaPublicacion || null,
  };
  if (incluirId) datos.p_id = h.supabaseId || h.id;
  return datos;
}

/* =========================================================
   HISTORIAS EN SUPABASE
========================================================= */
async function listarHistoriasSupabase() {
  try {
    const { data, error } = await supabaseClient.rpc('listar_historias');
    if (error) throw error;
    return (data || []).map(historiaDeSupabase);
  } catch (e) {
    console.error('Error listando historias:', e);
    return [];
  }
}

async function misHistoriasSupabase() {
  try {
    const { data, error } = await supabaseClient.rpc('mis_historias');
    if (error) throw error;
    return (data || []).map(historiaDeSupabase);
  } catch (e) {
    console.error('Error cargando mis historias:', e);
    return [];
  }
}

async function crearHistoriaSupabase(historia) {
  const datos = historiaParaSupabase(historia, false);
  const { data, error } = await supabaseClient.rpc('crear_historia', datos);
  if (error) throw error;
  return data;
}

async function actualizarHistoriaSupabase(historia) {
  const datos = historiaParaSupabase(historia, true);
  const { data, error } = await supabaseClient.rpc('actualizar_historia', datos);
  if (error) throw error;
  return data;
}

async function eliminarHistoriaSupabase(storyId) {
  const { data, error } = await supabaseClient.rpc('eliminar_historia', { p_id: storyId });
  if (error) throw error;
  return data;
}

/* =========================================================
   CAPÍTULOS EN SUPABASE
========================================================= */
async function listarCapitulosSupabase(storyId) {
  try {
    const { data, error } = await supabaseClient.rpc('listar_capitulos', { p_story_id: storyId });
    if (error) throw error;
    return (data || []).map(capituloDeSupabase);
  } catch (e) {
    console.error('Error listando capítulos:', e);
    return [];
  }
}

async function crearCapituloSupabase(storyId, titulo, contenido, notaAutor, orden) {
  const { data, error } = await supabaseClient.rpc('crear_capitulo', {
    p_story_id: storyId,
    p_title: titulo,
    p_content: contenido,
    p_author_note: notaAutor || null,
    p_chapter_order: orden,
  });
  if (error) throw error;
  return data;
}

async function actualizarCapituloSupabase(capituloId, titulo, contenido, notaAutor, orden) {
  const { data, error } = await supabaseClient.rpc('actualizar_capitulo', {
    p_id: capituloId,
    p_title: titulo,
    p_content: contenido,
    p_author_note: notaAutor || null,
    p_chapter_order: orden,
  });
  if (error) throw error;
  return data;
}

async function eliminarCapituloSupabase(capituloId) {
  const { data, error } = await supabaseClient.rpc('eliminar_capitulo', { p_id: capituloId });
  if (error) throw error;
  return data;
}

/* =========================================================
   PERFIL EN SUPABASE
========================================================= */
async function guardarPerfilSupabase(datos) {
  const { data: existe } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', usuarioActual.id)
    .single();

  if (existe) {
    const { error } = await supabaseClient
      .from('profiles')
      .update(datos)
      .eq('id', usuarioActual.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient
      .from('profiles')
      .insert({ id: usuarioActual.id, ...datos });
    if (error) throw error;
  }
}

async function cargarPerfilSupabase(userId) {
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  } catch (e) {
    console.error('Error cargando perfil:', e);
    return null;
  }
}

/* =========================================================
   STORAGE: PORTADAS
========================================================= */
async function subirPortadaSupabase(archivo, storyId) {
  const extension = (archivo.name || 'img.jpg').split('.').pop().toLowerCase() || 'jpg';
  const nombreArchivo = `${usuarioActual.id}/${storyId}_${Date.now()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from('Portadas')
    .upload(nombreArchivo, archivo, { upsert: true, cacheControl: '3600' });
  if (error) throw error;

  const { data: { publicUrl } } = supabaseClient.storage
    .from('Portadas')
    .getPublicUrl(nombreArchivo);
  return publicUrl;
}

async function subirPortadaBase64Supabase(base64, storyId) {
  const respuesta = await fetch(base64);
  const blob = await respuesta.blob();
  const archivo = new File([blob], `${storyId}_${Date.now()}.jpg`, { type: 'image/jpeg' });
  return await subirPortadaSupabase(archivo, storyId);
}

/* =========================================================
   STORAGE: AVATARES (foto de perfil)
========================================================= */
async function subirAvatarSupabase(archivo) {
  const extension = (archivo.name || 'avatar.jpg').split('.').pop().toLowerCase() || 'jpg';
  const nombreArchivo = `${usuarioActual.id}/avatar_${Date.now()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from('Avatares')
    .upload(nombreArchivo, archivo, { upsert: true, cacheControl: '3600' });
  if (error) throw error;

  const { data: { publicUrl } } = supabaseClient.storage
    .from('Avatares')
    .getPublicUrl(nombreArchivo);
  return publicUrl;
}

async function subirAvatarBase64Supabase(base64) {
  const respuesta = await fetch(base64);
  const blob = await respuesta.blob();
  const archivo = new File([blob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
  return await subirAvatarSupabase(archivo);
}

/* =========================================================
   HELPERS
========================================================= */
function getHistorias() { return _historiasCache; }

async function recargarHistorias() {
  if (!usuarioActual) return [];
  const historias = await listarHistoriasSupabase();
  _historiasCache = historias;
  return historias;
}

function esMiHistoria(h) {
  if (!h || !usuarioActual) return false;
  return h.user_id === usuarioActual.id;
}

async function cargarCapitulosDeHistoria(storyId) {
  const caps = await listarCapitulosSupabase(storyId);
  let h = _historiasCache.find(x => x.id === storyId);
  if (!h && historiaActual && historiaActual.id === storyId) h = historiaActual;
  if (h) h.capitulos = caps;
  return caps;
}

/* =========================================================
   PANTALLAS AUTH
========================================================= */
function ocultarTodasLasPantallas() {
  document.getElementById('vistaBienvenida').style.display = 'none';
  document.getElementById('vistaLogin').style.display = 'none';
  document.getElementById('vistaRegistro').style.display = 'none';
  document.getElementById('appPrincipal').style.display = 'none';
}

function mostrarBienvenida() {
  ocultarTodasLasPantallas();
  document.getElementById('vistaBienvenida').style.display = 'flex';
}

function mostrarLogin() {
  ocultarTodasLasPantallas();
  document.getElementById('vistaLogin').style.display = 'flex';
}

function mostrarRegistro() {
  ocultarTodasLasPantallas();
  document.getElementById('vistaRegistro').style.display = 'flex';
}

function mostrarApp() {
  ocultarTodasLasPantallas();
  document.getElementById('appPrincipal').style.display = 'block';
  document.querySelectorAll('#appPrincipal .vista').forEach(v => {
    v.style.display = 'none';
    v.classList.remove('activa');
  });
  const inicio = document.getElementById('vistaInicio');
  if (inicio) {
    inicio.style.display = 'block';
    inicio.classList.add('activa');
  }
}

document.getElementById('btnIrLogin').onclick = mostrarLogin;
document.getElementById('btnIrRegistro').onclick = mostrarRegistro;
document.getElementById('btnVolverBienvenida1').onclick = mostrarBienvenida;
document.getElementById('btnVolverBienvenida2').onclick = mostrarBienvenida;
document.getElementById('linkIrRegistro').onclick = e => { e.preventDefault(); mostrarRegistro(); };
document.getElementById('linkIrLogin').onclick = e => { e.preventDefault(); mostrarLogin(); };

/* =========================================================
   VALIDACIÓN DE EDAD EN REGISTRO
========================================================= */
const inputRegFecha = document.getElementById('regFechaNacimiento');
const errorRegEdad = document.getElementById('regErrorEdad');

if (inputRegFecha && errorRegEdad) {
  inputRegFecha.addEventListener('input', () => {
    const fecha = inputRegFecha.value;
    if (!fecha) {
      errorRegEdad.style.display = 'none';
      errorRegEdad.textContent = '';
      return;
    }
    const edad = calcularEdad(fecha);
    if (edad === null) {
      errorRegEdad.style.display = 'none';
      return;
    }
    if (edad < EDAD_MINIMA) {
      errorRegEdad.style.display = 'block';
      errorRegEdad.textContent = `❌ Lo sentimos, debes tener al menos ${EDAD_MINIMA} años para usar Aren. Pídele a un adulto que te ayude a crear la cuenta.`;
    } else {
      errorRegEdad.style.display = 'none';
      errorRegEdad.textContent = '';
    }
  });
}

/* =========================================================
   DIAGNÓSTICO
========================================================= */
document.getElementById('btnDiagnostico').onclick = async () => {
  toast('🔍 Ejecutando diagnóstico...', 'info', 2000);
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/settings', {
      headers: { 'apikey': SUPABASE_ANON_KEY }
    });
    if (r.status === 200) toast('✅ Conexión con Supabase: OK', 'success', 5000);
    else if (r.status === 401) toast('❌ Clave API inválida', 'error', 8000);
    else toast('⚠️ Supabase respondió: ' + r.status, 'warn', 5000);
  } catch (e) {
    toast('❌ Sin conexión: ' + e.message, 'error', 6000);
  }

  try {
    const { error } = await supabaseClient.rpc('listar_historias');
    if (error) toast('⚠️ RPC: ' + error.message, 'warn', 6000);
    else toast('✅ RPC listar_historias: OK', 'success', 5000);
  } catch (e) {
    toast('❌ RPC falló: ' + e.message, 'error', 6000);
  }

  try {
    const { error } = await supabaseClient.storage.from('Portadas').list('', { limit: 1 });
    if (error) toast('⚠️ Storage Portadas: ' + error.message, 'warn', 6000);
    else toast('✅ Storage "Portadas": OK', 'success', 5000);
  } catch (e) {
    toast('❌ Storage Portadas falló: ' + e.message, 'error', 6000);
  }

  try {
    const { error } = await supabaseClient.storage.from('Avatares').list('', { limit: 1 });
    if (error) toast('⚠️ Storage Avatares: ' + error.message, 'warn', 6000);
    else toast('✅ Storage "Avatares": OK', 'success', 5000);
  } catch (e) {
    toast('❌ Storage Avatares falló: ' + e.message, 'error', 6000);
  }

  if (edadUsuario) {
    toast(`📅 Tu edad: ${edadUsuario.anios} años (${edadUsuario.esMenor ? 'modo menor' : 'modo adulto'})`, 'info', 5000);
  }
};

/* =========================================================
   REGISTRO
========================================================= */
document.getElementById('formRegistro').onsubmit = async e => {
  e.preventDefault();
  const nombre = document.getElementById('regNombre').value.trim();
  const apellido = document.getElementById('regApellido').value.trim();
  const genero = document.getElementById('regGenero').value;
  const fechaNacimiento = document.getElementById('regFechaNacimiento').value;
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const btn = document.getElementById('btnRegistroSubmit');

  errorRegEdad.style.display = 'none';
  errorRegEdad.textContent = '';

  if (!nombre) { toast('Falta el nombre', 'error'); return; }
  if (!apellido) { toast('Falta el apellido', 'error'); return; }
  if (!genero) { toast('Selecciona un género', 'error'); return; }
  if (!fechaNacimiento) { toast('Falta la fecha de nacimiento', 'error'); return; }
  if (!username) { toast('Falta el nombre de usuario', 'error'); return; }
  if (!email) { toast('Falta el correo', 'error'); return; }
  if (password.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

  const edad = calcularEdad(fechaNacimiento);
  if (edad === null) { toast('Fecha de nacimiento inválida', 'error'); return; }
  if (edad < EDAD_MINIMA) {
    errorRegEdad.style.display = 'block';
    errorRegEdad.textContent = `❌ Lo sentimos, debes tener al menos ${EDAD_MINIMA} años para usar Aren. Pídele a un adulto que te ayude a crear la cuenta.`;
    errorRegEdad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`Debes tener al menos ${EDAD_MINIMA} años para registrarte.`, 'error', 6000);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre,
          apellido,
          genero,
          fecha_nacimiento: fechaNacimiento,
          username,
          emoji: '👤'
        },
        emailRedirectTo: window.location.origin
      }
    });

    if (error) { mostrarErrorCompleto(error, 'Error al registrar'); return; }

    if (data && data.user && data.session) {
      try {
        await guardarPerfilSupabase({
          username,
          nombre,
          apellido,
          genero,
          fecha_nacimiento: fechaNacimiento,
          bio: '',
          emoji: '👤',
          avatar_url: null
        });
      } catch (errPerfil) {
        console.warn('No se pudo guardar el perfil completo aún:', errPerfil);
      }
    }

    const requiereConfirmacion = data && data.user && !data.session;
    if (requiereConfirmacion) toast('✅ ¡Cuenta creada! Revisa tu correo.', 'success', 8000);
    else toast('✅ ¡Cuenta creada! Ya puedes entrar.', 'success', 5000);

    document.getElementById('formRegistro').reset();
    errorRegEdad.style.display = 'none';
    setTimeout(() => mostrarLogin(), 2500);

  } catch (err) {
    mostrarErrorCompleto(err, 'Error inesperado en registro');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
};

/* =========================================================
   LOGIN
========================================================= */
document.getElementById('formLogin').onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLoginSubmit');

  if (!email || !password) { toast('Completa correo y contraseña', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      mostrarErrorCompleto(error, 'Login');
      return;
    }

    if (!data || !data.user) { toast('⚠️ No se pudo obtener el usuario.', 'warn', 6000); return; }

    toast('✅ ¡Bienvenido, ' + (data.user.email || '') + '!', 'success', 3000);
    document.getElementById('formLogin').reset();
    await inicializarApp(data.user);

  } catch (err) {
    mostrarErrorCompleto(err, 'Error inesperado en login');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
};

/* =========================================================
   CERRAR SESIÓN
========================================================= */
async function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  try {
    await supabaseClient.auth.signOut();
    usuarioActual = null;
    perfilActual = null;
    edadUsuario = null;
    _historiasCache = [];
    for (const k in cacheImagenes) delete cacheImagenes[k];
    detenerCarrusel();
    toast('Sesión cerrada', 'info');
    mostrarBienvenida();
  } catch (err) {
    toast('Error al cerrar sesión', 'error');
  }
}

document.getElementById('btnCerrarSesion').onclick = cerrarSesion;
document.getElementById('btnCerrarSesionPC').onclick = cerrarSesion;

/* =========================================================
   INICIALIZAR APP
========================================================= */
async function inicializarApp(user) {
  usuarioActual = user;

  let perfilSupabase = await cargarPerfilSupabase(user.id);

  if (perfilSupabase) {
    perfilActual = {
      username: perfilSupabase.username || 'Anónimo',
      nombre: perfilSupabase.nombre || '',
      apellido: perfilSupabase.apellido || '',
      genero: perfilSupabase.genero || '',
      fecha_nacimiento: perfilSupabase.fecha_nacimiento || null,
      bio: perfilSupabase.bio || '',
      emoji: perfilSupabase.emoji || '👤',
      avatar_url: perfilSupabase.avatar_url || null,
      created_at: perfilSupabase.created_at || user.created_at || null,
    };
  } else {
    const meta = user.user_metadata || {};
    perfilActual = {
      username: meta.username || (user.email ? user.email.split('@')[0] : 'Anónimo'),
      nombre: meta.nombre || '',
      apellido: meta.apellido || '',
      genero: meta.genero || '',
      fecha_nacimiento: meta.fecha_nacimiento || null,
      bio: '',
      emoji: meta.emoji || '👤',
      avatar_url: null,
      created_at: user.created_at || null,
    };

    try {
      await guardarPerfilSupabase({
        username: perfilActual.username,
        nombre: perfilActual.nombre,
        apellido: perfilActual.apellido,
        genero: perfilActual.genero,
        fecha_nacimiento: perfilActual.fecha_nacimiento,
        bio: '',
        emoji: perfilActual.emoji,
        avatar_url: null
      });
    } catch (e) {
      console.warn('No se pudo crear perfil inicial:', e);
    }
  }

  actualizarEdadUsuario(perfilActual.fecha_nacimiento);
  actualizarAvatarCabecera();
  actualizarDrawerUsuario();
  actualizarSidebarUsuario();

  toast('☁️ Cargando historias...', 'info', 2000);
  await recargarHistorias();
  toast('✅ Historias cargadas', 'success', 2000);

  mostrarApp();
  mostrarVista('inicio');
}

/* =========================================================
   AVATAR CABECERA
========================================================= */
function actualizarAvatarCabecera() {
  const btn = document.getElementById('btnPerfilTop');
  if (!btn) return;
  if (perfilActual && perfilActual.avatar_url) {
    btn.innerHTML = `<img src="${perfilActual.avatar_url}" alt="" onerror="this.style.display='none'; this.parentElement.textContent='${perfilActual.emoji || '👤'}';">`;
  } else {
    btn.textContent = (perfilActual && perfilActual.emoji) || '👤';
  }
}

/* =========================================================
   DRAWER USUARIO + SIDEBAR USUARIO
========================================================= */
function actualizarDrawerUsuario() {
  const drawerUser = document.getElementById('drawerUsuario');
  if (!drawerUser || !usuarioActual) return;

  const edadTxt = edadUsuario ? `📅 ${edadUsuario.anios} años` : '';
  const modoTxt = edadUsuario ? (edadUsuario.esMenor ? '👶 Menor' : '✅ Mayor') : '';
  const miembroTxt = formatearMiembroDesde(perfilActual.created_at);

  drawerUser.innerHTML = `
    <span class="nombre-drawer">${escapeHtml(perfilActual.username || 'Anónimo')}</span>
    ${escapeHtml(usuarioActual.email || '')}
    ${edadTxt ? `<span class="info-edad-drawer">${edadTxt} · ${modoTxt}</span>` : ''}
    ${miembroTxt ? `<span class="miembro-drawer">🎂 ${miembroTxt}</span>` : ''}
  `;
}

function actualizarSidebarUsuario() {
  const sidebarUser = document.getElementById('sidebarUsuario');
  if (!sidebarUser || !usuarioActual) return;

  const edadTxt = edadUsuario ? `📅 ${edadUsuario.anios} años` : '';
  const modoTxt = edadUsuario ? (edadUsuario.esMenor ? '👶 Menor' : '✅ Mayor') : '';
  const miembroTxt = formatearMiembroDesde(perfilActual.created_at);

  sidebarUser.innerHTML = `
    <span class="nombre-sidebar">${escapeHtml(perfilActual.username || 'Anónimo')}</span>
    ${escapeHtml(usuarioActual.email || '')}
    ${edadTxt ? `<span class="info-sidebar">${edadTxt} · ${modoTxt}</span>` : ''}
    ${miembroTxt ? `<span class="info-sidebar">🎂 ${miembroTxt}</span>` : ''}
  `;
}

/* =========================================================
   PANTALLA COMPLETA
========================================================= */
function salirDePantallaCompleta() {
  document.body.classList.remove('modo-pantalla-completa');
  const btnSalir = document.getElementById('btnSalirPantallaCompleta');
  if (btnSalir) btnSalir.style.display = 'none';
  document.body.style.overflow = '';
}

/* =========================================================
   NAVEGACIÓN
========================================================= */
const vistas = {
  inicio:     document.getElementById('vistaInicio'),
  catalogo:   document.getElementById('vistaCatalogo'),
  publicar:   document.getElementById('vistaPublicar'),
  biblioteca: document.getElementById('vistaBiblioteca'),
  historial:  document.getElementById('vistaHistorial'),
  siguiendo:  document.getElementById('vistaSiguiendo'),
  comunidades: document.getElementById('vistaComunidades'),
  popular:    document.getElementById('vistaPopular'),
  crearPost:  document.getElementById('vistaCrearPost'),
  lector:     document.getElementById('vistaLector'),
  editorCapitulo: document.getElementById('vistaEditorCapitulo'),
  perfil:     document.getElementById('vistaPerfil'),
  ajustes:    document.getElementById('vistaAjustes'),
};

function actualizarBotonActivo(nombre) {
  document.querySelectorAll('.sidebar-btn[data-vista]').forEach(b => {
    b.classList.toggle('activo', b.dataset.vista === nombre);
  });
  document.querySelectorAll('.bn-btn[data-vista]').forEach(b => {
    b.classList.toggle('activo', b.dataset.vista === nombre);
  });
}

async function mostrarVista(nombre) {
  if (nombre !== 'lector') {
    salirDePantallaCompleta();
  }

  document.querySelectorAll('#appPrincipal .vista').forEach(v => {
    v.style.display = 'none';
    v.classList.remove('activa');
  });
  const lecturaCap = document.getElementById('vistaLecturaCapitulo');
  if (lecturaCap) lecturaCap.style.display = 'none';

  if (vistas[nombre]) {
    vistas[nombre].style.display = 'block';
    vistas[nombre].classList.add('activa');
  }

  actualizarBotonActivo(nombre);

  cerrarDrawer();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (nombre === 'inicio')     await renderizarHistorias();
  if (nombre === 'catalogo')   await renderizarCatalogo();
  if (nombre === 'biblioteca') renderizarBiblioteca();
  if (nombre === 'historial')  renderizarHistorial();
  if (nombre === 'siguiendo')  renderizarSiguiendo();
  if (nombre === 'perfil')     await renderizarPerfil();
  if (nombre === 'ajustes')    renderizarAjustes();
  if (nombre === 'publicar')   activarTabPublicar('publicadas');
}

const drawer = document.getElementById('drawer');
const overlay = document.getElementById('drawerOverlay');
const abrirDrawer = () => { drawer.classList.add('abierto'); overlay.classList.add('abierto'); };
const cerrarDrawer = () => { drawer.classList.remove('abierto'); overlay.classList.remove('abierto'); };

document.getElementById('btnMenu').onclick = abrirDrawer;
document.getElementById('btnCerrarDrawer').onclick = cerrarDrawer;
overlay.onclick = cerrarDrawer;

document.querySelectorAll('.drawer-nav button[data-vista]').forEach(btn => {
  btn.onclick = () => {
    const v = btn.dataset.vista;
    if (v === 'publicar') mostrarVista('publicar');
    else mostrarVista(v);
  };
});

document.querySelectorAll('.sidebar-btn[data-vista]').forEach(btn => {
  btn.onclick = () => {
    const v = btn.dataset.vista;
    if (v === 'publicar') mostrarVista('publicar');
    else mostrarVista(v);
  };
});

document.querySelectorAll('.bn-btn[data-vista]').forEach(btn => {
  btn.onclick = () => {
    const v = btn.dataset.vista;
    if (v === 'publicar') {
      prepararNuevaHistoria();
      mostrarVista('publicar');
      activarTabPublicar('formulario');
    } else {
      mostrarVista(v);
    }
  };
});

document.getElementById('btnPerfilTop').onclick = () => mostrarVista('perfil');

document.getElementById('btnPublicarFlotante').onclick = () => {
  prepararNuevaHistoria();
  mostrarVista('publicar');
  activarTabPublicar('formulario');
};

/* =========================================================
   UTILIDADES CONTENIDO
========================================================= */
const contarPalabras = html => {
  const limpio = (html || '').replace(/<[^>]*>/g, ' ').trim();
  return limpio ? limpio.split(/\s+/).length : 0;
};
const totalPalabrasHistoria = h => (h.capitulos || []).reduce((a, c) => a + contarPalabras(c.contenido), 0);
const minutosLectura = palabras => Math.max(1, Math.ceil(palabras / 200));
const promedioEstrellas = h => {
  if (!h.valoraciones || !h.valoraciones.length) return 0;
  return (h.valoraciones.reduce((a, b) => a + b, 0) / h.valoraciones.length).toFixed(1);
};
const estrellitas = p => '★'.repeat(Math.round(p)) + '☆'.repeat(5 - Math.round(p));

const TAMANO_MAX_IMG = 3 * 1024 * 1024;
const ANCHO_MAX_IMG = 1000;
const CALIDAD_JPEG = 0.85;

function validarImagen(file) {
  if (!file) return { ok: false, motivo: 'sin-archivo' };
  const tipos = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!tipos.includes(file.type)) return { ok: false, motivo: 'formato' };
  if (file.size > TAMANO_MAX_IMG) return { ok: false, motivo: 'pesada', mb: (file.size / 1024 / 1024).toFixed(1) };
  return { ok: true };
}

function redimensionarImagen(file, anchoMax = ANCHO_MAX_IMG) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let ancho = img.width, alto = img.height;
        if (ancho > anchoMax) { alto = Math.round((anchoMax / ancho) * alto); ancho = anchoMax; }
        const canvas = document.createElement('canvas');
        canvas.width = ancho; canvas.height = alto;
        canvas.getContext('2d').drawImage(img, 0, 0, ancho, alto);
        resolve(canvas.toDataURL('image/jpeg', CALIDAD_JPEG));
      };
      img.onerror = () => reject('Error al cargar imagen');
      img.src = ev.target.result;
    };
    reader.onerror = () => reject('Error al leer archivo');
    reader.readAsDataURL(file);
  });
}

function pesoBase64(base64) {
  if (!base64) return 0;
  return Math.round(((base64.split(',')[1] || '').length * 3) / 4);
}

function esVisible(h) {
  if (h.esBorrador) return false;
  if (h.fechaPublicacion && new Date(h.fechaPublicacion) > new Date()) return false;
  return true;
}

/* =========================================================
   TARJETAS
========================================================= */
function crearTarjeta(h) {
  const div = document.createElement('div');
  div.className = 'tarjeta';

  const portadaDiv = document.createElement('div');
  portadaDiv.className = 'tarjeta-portada';

  if (h.portadaUrl) {
    portadaDiv.innerHTML = `<img src="${h.portadaUrl}" alt="">`;
  } else if (h.portadaId) {
    portadaDiv.innerHTML = '📖';
    cargarImagenLocal(h.portadaId).then(base64 => {
      if (base64) portadaDiv.innerHTML = `<img src="${base64}" alt="">`;
    }).catch(() => {});
  } else {
    portadaDiv.innerHTML = '📖';
  }

  const autor = h.autor || 'Anónimo';
  const esMia = esMiHistoria(h);

  let badgeEspecial = '';
  if (h.esBorrador) {
    badgeEspecial = '<span class="badge-borrador">📝 Borrador</span>';
  } else if (h.fechaPublicacion && new Date(h.fechaPublicacion) > new Date()) {
    const f = new Date(h.fechaPublicacion);
    badgeEspecial = `<span class="badge-programada">🕒 ${f.toLocaleDateString()}</span>`;
  }

  const subgeneros = (h.subgenero || []).slice(0, 3).map(s => `<span class="etiqueta-sub">${escapeHtml(s)}</span>`).join('');
  const etiquetas = h.etiquetas.slice(0, 4).map(e => `#${escapeHtml(e)}`).join(' ');

  const capTexto = h.capitulos.length > 0
    ? `${h.capitulos.length} capítulo${h.capitulos.length === 1 ? '' : 's'}`
    : 'Sin capítulos aún';

  const infoDiv = document.createElement('div');
  infoDiv.className = 'tarjeta-info';
  infoDiv.innerHTML = `
    <h3>${escapeHtml(h.titulo)}</h3>
    <p class="autor-mini">por ${escapeHtml(autor)}${esMia ? ' <span style="color:#43a047;">(tú)</span>' : ''}</p>
    <div class="tarjeta-datos">
      <div class="tarjeta-fila">📚 ${escapeHtml(h.genero)}</div>
      ${subgeneros ? `<div class="tarjeta-fila tarjeta-fila-chips">${subgeneros}</div>` : ''}
      ${etiquetas ? `<div class="tarjeta-fila">🏷️ ${etiquetas}</div>` : ''}
      <div class="tarjeta-fila">📖 ${capTexto}</div>
      <div class="tarjeta-fila">✍️ ${escapeHtml(h.estado || 'En curso')}</div>
    </div>
    ${badgeEspecial}
  `;

  div.appendChild(portadaDiv);
  div.appendChild(infoDiv);
  div.onclick = () => abrirLector(h.id);
  return div;
}

/* =========================================================
   VISTAS
========================================================= */
async function renderizarHistorias(filtro = '') {
  const cont = document.getElementById('listaHistorias');
  const vacio = document.getElementById('mensajeVacio');
  cont.innerHTML = '<p class="mensaje-vacio">⏳ Cargando...</p>';
  vacio.style.display = 'none';

  await recargarHistorias();

  const todas = filtrarHistoriasPorEdad(_historiasCache.filter(esVisible));

  iniciarCarrusel(todas);

  cont.innerHTML = '';
  const historias = todas.filter(h => {
    if (!filtro) return true;
    const t = (h.titulo + ' ' + (h.autor || '') + ' ' + h.genero + ' ' + h.etiquetas.join(' ')).toLowerCase();
    return t.includes(filtro.toLowerCase());
  });
  if (!historias.length) vacio.style.display = 'block';
  else {
    vacio.style.display = 'none';
    historias.forEach(h => cont.appendChild(crearTarjeta(h)));
  }
}
document.getElementById('inputBuscar').oninput = e => renderizarHistorias(e.target.value);

let generoFiltro = 'Todos';
async function renderizarCatalogo() {
  const filtros = document.getElementById('filtrosGenero');
  if (!filtros.dataset.listo) {
    ['Todos', ...GENEROS_PRINCIPALES].forEach(g => {
      const b = document.createElement('button');
      b.textContent = g;
      b.onclick = () => { generoFiltro = g; renderizarCatalogo(); };
      filtros.appendChild(b);
    });
    filtros.dataset.listo = '1';
  }
  [...filtros.children].forEach(b => b.classList.toggle('activo', b.textContent === generoFiltro));

  const cont = document.getElementById('catalogoLista');
  cont.innerHTML = '<p class="mensaje-vacio">⏳ Cargando...</p>';

  await recargarHistorias();

  cont.innerHTML = '';
  const historias = filtrarHistoriasPorEdad(_historiasCache.filter(esVisible))
    .filter(h => generoFiltro === 'Todos' || h.genero === generoFiltro);
  if (!historias.length) {
    cont.innerHTML = '<p class="mensaje-vacio">No hay historias en esta categoría.</p>';
    return;
  }
  historias.forEach(h => cont.appendChild(crearTarjeta(h)));
}

function renderizarBiblioteca() {
  const cont = document.getElementById('listaBiblioteca');
  const vacio = document.getElementById('bibliotecaVacia');
  cont.innerHTML = '';
  const ids = getBiblioteca();
  const historias = filtrarHistoriasPorEdad(_historiasCache.filter(h => ids.includes(h.id)));
  if (!historias.length) vacio.style.display = 'block';
  else { vacio.style.display = 'none'; historias.forEach(h => cont.appendChild(crearTarjeta(h))); }
}

function renderizarHistorial() {
  const cont = document.getElementById('listaHistorial');
  const vacio = document.getElementById('historialVacio');
  cont.innerHTML = '';
  const hist = getHistorial();
  const entradas = Object.entries(hist)
    .map(([id, datos]) => ({ historia: _historiasCache.find(h => h.id === id), datos }))
    .filter(e => e.historia)
    .filter(e => historiaEsAptaParaMi(e.historia))
    .sort((a, b) => new Date(b.datos.fecha) - new Date(a.datos.fecha));

  if (!entradas.length) vacio.style.display = 'block';
  else {
    vacio.style.display = 'none';
    entradas.forEach(({ historia, datos }) => {
      const t = crearTarjeta(historia);
      const info = document.createElement('div');
      info.style.cssText = 'font-size:.75rem;color:var(--color-meta);padding:6px 10px;';
      info.textContent = `Cap. ${datos.capituloIdx + 1} · ${new Date(datos.fecha).toLocaleDateString()}`;
      t.appendChild(info);
      cont.appendChild(t);
    });
  }
}

function renderizarSiguiendo() {
  const cont = document.getElementById('listaAutores');
  const vacio = document.getElementById('siguiendoVacio');
  if (!cont) return;
  cont.innerHTML = '';

  const autores = getSiguiendo();

  if (!autores.length) { if (vacio) vacio.style.display = 'block'; return; }
  if (vacio) vacio.style.display = 'none';

  autores.forEach(nombreAutor => {
    const historiasDelAutor = _historiasCache.filter(h => (h.autor || 'Anónimo') === nombreAutor);
    let autorFoto = null;
    for (const h of historiasDelAutor) { if (h.autorFoto) { autorFoto = h.autorFoto; break; } }
    const seguidores = contarSeguidores(nombreAutor);

    const div = document.createElement('div');
    div.className = 'autor-card';
    div.innerHTML = `
      <div class="avatar">${autorFoto ? `<img src="${autorFoto}">` : '👤'}</div>
      <div class="info-autor">
        <div class="nombre-autor">${escapeHtml(nombreAutor)}</div>
        <div class="meta-autor">
          <span>📚 ${historiasDelAutor.length} historia${historiasDelAutor.length === 1 ? '' : 's'}</span>
          <span>👥 ${seguidores} seguidor${seguidores === 1 ? '' : 'es'}</span>
        </div>
      </div>
      <button class="btn-secundario" data-dejar="${escapeHtml(nombreAutor)}">Dejar de seguir</button>
    `;
    div.querySelector('[data-dejar]').onclick = () => {
      setSiguiendo(getSiguiendo().filter(a => a !== nombreAutor));
      toast('Dejaste de seguir a ' + nombreAutor, 'info');
      renderizarSiguiendo();
    };
    cont.appendChild(div);
  });
}

function contarSeguidores(nombreAutor) {
  let cuenta = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('aren_siguiendo_')) {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(arr) && arr.includes(nombreAutor)) cuenta++;
      } catch (e) {}
    }
  }
  return cuenta;
}

/* =========================================================
   PUBLICAR
========================================================= */
function activarTabPublicar(nombre) {
  const tabs = ['publicadas', 'borradores', 'formulario'];
  tabs.forEach(t => {
    const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.style.display = (t === nombre) ? 'block' : 'none';
  });

  document.getElementById('tabMisPublicadas').classList.toggle('activo', nombre === 'publicadas');
  document.getElementById('tabMisBorradores').classList.toggle('activo', nombre === 'borradores');

  if (nombre === 'publicadas') cargarMisPublicadas();
  if (nombre === 'borradores') cargarMisBorradores();
}

document.getElementById('tabMisPublicadas').onclick = () => activarTabPublicar('publicadas');
document.getElementById('tabMisBorradores').onclick = () => activarTabPublicar('borradores');
document.getElementById('btnNuevaHistoriaTab').onclick = () => {
  prepararNuevaHistoria();
  activarTabPublicar('formulario');
};
document.getElementById('btnCancelarFormulario').onclick = () => activarTabPublicar('publicadas');

async function cargarMisPublicadas() {
  const cont = document.getElementById('listaMisPublicadas');
  const vacio = document.getElementById('misPublicadasVacio');
  cont.innerHTML = '<p class="mensaje-vacio">⏳ Cargando...</p>';
  vacio.style.display = 'none';

  try {
    const mis = await misHistoriasSupabase();
    const publicadas = mis.filter(h => !h.esBorrador);
    cont.innerHTML = '';
    if (!publicadas.length) vacio.style.display = 'block';
    else { vacio.style.display = 'none'; publicadas.forEach(h => cont.appendChild(crearTarjeta(h))); }
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p class="mensaje-vacio">⚠️ Error al cargar</p>';
  }
}

async function cargarMisBorradores() {
  const cont = document.getElementById('listaMisBorradores');
  const vacio = document.getElementById('misBorradoresVacio');
  cont.innerHTML = '<p class="mensaje-vacio">⏳ Cargando...</p>';
  vacio.style.display = 'none';

  try {
    const mis = await misHistoriasSupabase();
    const borradores = mis.filter(h => h.esBorrador);
    cont.innerHTML = '';
    if (!borradores.length) vacio.style.display = 'block';
    else { vacio.style.display = 'none'; borradores.forEach(h => cont.appendChild(crearTarjeta(h))); }
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p class="mensaje-vacio">⚠️ Error al cargar</p>';
  }
}

/* =========================================================
   FORMULARIO HISTORIA
========================================================= */
let historiaEnEdicionId = null;
let portadaTempBase64 = null;

document.getElementById('portada').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const info = document.getElementById('infoPortada');
  const v = validarImagen(file);
  if (!v.ok) {
    if (v.motivo === 'pesada') { toast(`La imagen pesa ${v.mb} MB. Máximo 3 MB.`, 'error', 5000); info.textContent = `⚠️ ${v.mb} MB — demasiado pesada`; }
    else if (v.motivo === 'formato') { toast('Solo PNG o JPG', 'error'); info.textContent = '⚠️ Formato no permitido'; }
    e.target.value = ''; portadaTempBase64 = null;
    document.getElementById('previewPortada').innerHTML = '';
    return;
  }
  info.textContent = '⏳ Procesando imagen...';
  try {
    const originalMB = (file.size / 1024 / 1024).toFixed(2);
    const base64 = await redimensionarImagen(file);
    const nuevoKB = Math.round(pesoBase64(base64) / 1024);
    portadaTempBase64 = base64;
    document.getElementById('previewPortada').innerHTML = `<img src="${portadaTempBase64}">`;
    info.textContent = `✓ ${originalMB} MB → ${nuevoKB} KB (optimizada)`;
  } catch (err) {
    toast('No se pudo procesar la imagen', 'error');
    info.textContent = '⚠️ Error al procesar';
    e.target.value = ''; portadaTempBase64 = null;
  }
};

document.getElementById('etiquetas').oninput = e => {
  const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  document.getElementById('etiquetasPreview').innerHTML =
    tags.map(t => `<span class="etiqueta">#${escapeHtml(t)}</span>`).join('');
};

function leerAdvertenciasSeleccionadas() {
  const arr = [];
  ['adv18', 'advViolencia', 'advSensible', 'advLenguaje'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.checked) arr.push(el.value);
  });
  return arr;
}

function marcarAdvertencias(arr = []) {
  const mapa = { '+18': 'adv18', 'Violencia': 'advViolencia', 'Temas sensibles': 'advSensible', 'Lenguaje fuerte': 'advLenguaje' };
  Object.values(mapa).forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
  arr.forEach(a => { const id = mapa[a]; if (id) document.getElementById(id).checked = true; });
}

document.getElementById('chkBorrador').onchange = e => {
  document.getElementById('bloqueProgramar').style.display = e.target.checked ? 'none' : 'block';
};

function prepararNuevaHistoria() {
  historiaEnEdicionId = null;
  portadaTempBase64 = null;
  document.getElementById('tituloFormulario').textContent = 'Nueva historia';
  document.getElementById('btnGuardarHistoria').textContent = 'Publicar historia';
  document.getElementById('formHistoria').reset();
  document.getElementById('portada').value = '';
  document.getElementById('previewPortada').innerHTML = '';
  document.getElementById('etiquetasPreview').innerHTML = '';
  document.getElementById('infoPortada').textContent = '';
  document.getElementById('autor').value = (perfilActual && perfilActual.username) || 'Anónimo';
  document.getElementById('dedicatoria').value = '';
  document.getElementById('fechaPublicacion').value = '';
  document.getElementById('chkBorrador').checked = false;
  document.getElementById('bloqueProgramar').style.display = 'block';
  marcarAdvertencias([]);
  resetearGrids();
}

function prepararEdicionHistoria(id) {
  const h = _historiasCache.find(x => x.id === id);
  if (!h) return;
  if (!esMiHistoria(h)) { toast('No puedes editar historias de otros autores.', 'warn'); return; }
  historiaEnEdicionId = id;
  portadaTempBase64 = null;
  document.getElementById('tituloFormulario').textContent = 'Editar historia';
  document.getElementById('btnGuardarHistoria').textContent = 'Guardar cambios';
  document.getElementById('titulo').value = h.titulo;
  document.getElementById('autor').value = h.autor || '';
  document.getElementById('dedicatoria').value = h.dedicatoria || '';
  document.getElementById('sinopsis').value = h.sinopsis;
  document.getElementById('estado').value = h.estado || 'En curso';
  document.getElementById('etiquetas').value = h.etiquetas.join(', ');
  document.getElementById('etiquetas').oninput({ target: document.getElementById('etiquetas') });
  marcarAdvertencias(h.advertencias || []);
  document.getElementById('chkBorrador').checked = !!h.esBorrador;
  document.getElementById('fechaPublicacion').value = h.fechaPublicacion ? h.fechaPublicacion.slice(0, 16) : '';
  document.getElementById('bloqueProgramar').style.display = h.esBorrador ? 'none' : 'block';
  document.getElementById('infoPortada').textContent = '';
  const prev = document.getElementById('previewPortada');
  prev.innerHTML = '';
  if (h.portadaUrl) prev.innerHTML = `<img src="${h.portadaUrl}">`;

  generoSeleccionado = h.genero || '';
  document.getElementById('genero').value = generoSeleccionado;
  subgenerosSeleccionados = Array.isArray(h.subgenero) ? h.subgenero.slice(0, MAX_SUBGENEROS) : [];
  renderizarGridGeneros();
  renderizarGridSubgeneros();
  actualizarContadorGenero();
  actualizarContadorSubgeneros();

  mostrarVista('publicar');
  activarTabPublicar('formulario');
}

document.getElementById('formHistoria').onsubmit = async e => {
  e.preventDefault();
  const titulo = document.getElementById('titulo').value.trim();
  const autor = document.getElementById('autor').value.trim();
  const dedicatoria = document.getElementById('dedicatoria').value.trim();
  const sinopsis = document.getElementById('sinopsis').value.trim();
  const genero = generoSeleccionado;
  const subgenero = subgenerosSeleccionados.slice();
  const estado = document.getElementById('estado').value;
  const etiquetasRaw = document.getElementById('etiquetas').value.split(',').map(s => s.trim()).filter(Boolean);
  const advertencias = leerAdvertenciasSeleccionadas();
  const esBorrador = document.getElementById('chkBorrador').checked;
  const fechaPubInput = document.getElementById('fechaPublicacion').value;
  const fechaPublicacion = (!esBorrador && fechaPubInput) ? new Date(fechaPubInput).toISOString() : null;

  if (!titulo) { toast('Falta el título', 'error'); return; }
  if (titulo.length < 3) { toast('El título debe tener al menos 3 caracteres', 'error'); return; }
  if (!sinopsis) { toast('Falta la sinopsis', 'error'); return; }
  if (sinopsis.length < 10) { toast('La sinopsis es muy corta', 'error'); return; }
  if (!genero) { toast('Elige un género principal', 'error'); return; }
  if (subgenero.length === 0) { toast('Elige al menos 1 subgénero', 'error'); return; }

  const perfil = perfilActual || { username: 'Anónimo' };
  const btn = document.getElementById('btnGuardarHistoria');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    let portadaUrl = null;
    if (portadaTempBase64) {
      btn.textContent = 'Subiendo portada...';
      portadaUrl = await subirPortadaBase64Supabase(portadaTempBase64, historiaEnEdicionId || 'nueva');
    }

    const datos = {
      titulo,
      autor: autor || perfil.username || 'Anónimo',
      autorFoto: perfil.avatar_url || null,
      dedicatoria,
      sinopsis, genero, subgenero, estado, advertencias,
      etiquetas: etiquetasRaw.slice(0, 10),
      esBorrador,
      fechaPublicacion,
      portadaUrl: portadaUrl || null,
    };

    if (historiaEnEdicionId) {
      const vieja = _historiasCache.find(h => h.id === historiaEnEdicionId);
      if (!vieja) { toast('No se encontró la historia', 'error'); return; }
      if (!esMiHistoria(vieja)) { toast('No es tu historia', 'warn'); return; }
      if (!portadaUrl) datos.portadaUrl = vieja.portadaUrl;

      btn.textContent = 'Guardando cambios...';
      await actualizarHistoriaSupabase({ ...vieja, ...datos });
      historiaEnEdicionId = null;
      portadaTempBase64 = null;
      toast('✅ Historia actualizada', 'success');
    } else {
      btn.textContent = 'Publicando...';
      const nuevoId = await crearHistoriaSupabase(datos);

      if (portadaTempBase64 && !portadaUrl) {
        const url = await subirPortadaBase64Supabase(portadaTempBase64, nuevoId);
        await actualizarHistoriaSupabase({ id: nuevoId, supabaseId: nuevoId, ...datos, portadaUrl: url });
      }

      toast('✅ ¡Historia guardada!', 'success');
      portadaTempBase64 = null;
    }

    document.getElementById('formHistoria').reset();
    document.getElementById('portada').value = '';
    document.getElementById('previewPortada').innerHTML = '';
    document.getElementById('etiquetasPreview').innerHTML = '';
    document.getElementById('infoPortada').textContent = '';
    document.getElementById('bloqueProgramar').style.display = 'block';
    marcarAdvertencias([]);
    resetearGrids();

    await recargarHistorias();
    mostrarVista('publicar');
    if (esBorrador) activarTabPublicar('borradores');
    else activarTabPublicar('publicadas');

  } catch (err) {
    console.error('Error al guardar historia:', err);
    mostrarErrorCompleto(err, 'Error al guardar');
  } finally {
    btn.disabled = false;
    btn.textContent = historiaEnEdicionId ? 'Guardar cambios' : 'Publicar historia';
  }
};

/* =========================================================
   LECTOR
========================================================= */
let historiaActual = null;
let capituloActualIdx = 0;

async function abrirLector(id) {
  let h = _historiasCache.find(x => x.id === id);

  if (!h) {
    try {
      const mis = await misHistoriasSupabase();
      h = mis.find(x => x.id === id);
    } catch (e) {
      console.error('Error buscando historia:', e);
    }
  }

  if (!h) {
    toast('No se encontró la historia', 'warn');
    return mostrarVista('inicio');
  }

  if (!historiaEsAptaParaMi(h)) {
    toast('🔞 Esta historia contiene contenido no apto para tu edad.', 'warn', 8000);
    return mostrarVista('inicio');
  }

  historiaActual = h;

  document.getElementById('detalleHistoria').style.display = 'block';
  document.getElementById('vistaLecturaCapitulo').style.display = 'none';

  const img = document.getElementById('detallePortada');
  img.style.display = 'none';
  if (h.portadaUrl) { img.src = h.portadaUrl; img.style.display = 'block'; }

  document.getElementById('lectorTitulo').textContent = h.titulo;
  document.getElementById('lectorAutor').textContent = `por ${h.autor || 'Anónimo'}`;

  const subgenerosTxt = (h.subgenero && h.subgenero.length) ? ' · ' + h.subgenero.join(', ') : '';
  const capTexto = h.capitulos.length > 0
    ? `${h.capitulos.length} capítulo${h.capitulos.length === 1 ? '' : 's'}`
    : 'Sin capítulos aún';

  document.getElementById('lectorMeta').innerHTML = `
    <div class="lector-datos">
      <div class="lector-fila">📚 ${escapeHtml(h.genero)}${subgenerosTxt ? escapeHtml(subgenerosTxt) : ''}</div>
      ${h.etiquetas && h.etiquetas.length ? `<div class="lector-fila">🏷️ ${h.etiquetas.map(e => '#' + escapeHtml(e)).join(' ')}</div>` : ''}
      <div class="lector-fila">📖 ${capTexto}</div>
      <div class="lector-fila">✍️ ${escapeHtml(h.estado || 'En curso')}</div>
    </div>
  `;

  const contAdv = document.getElementById('lectorAdvertencias');
  contAdv.innerHTML = '';
  if (h.advertencias && h.advertencias.length) {
    h.advertencias.forEach(a => {
      const s = document.createElement('span');
      s.className = 'aviso';
      s.textContent = '⚠️ ' + a;
      contAdv.appendChild(s);
    });
  }

  const detalleDed = document.getElementById('lectorDedicatoria');
  if (detalleDed) detalleDed.remove();
  if (h.dedicatoria) {
    const d = document.createElement('div');
    d.id = 'lectorDedicatoria';
    d.className = 'dedicatoria';
    d.textContent = '💝 ' + h.dedicatoria;
    document.getElementById('lectorSinopsis').parentNode.insertBefore(d, document.getElementById('lectorSinopsis'));
  }

  document.getElementById('lectorSinopsis').textContent = h.sinopsis;

  const soyAutor = esMiHistoria(h);

  const bloqueAutor = document.getElementById('accionesAutor');
  if (bloqueAutor) bloqueAutor.style.display = soyAutor ? 'flex' : 'none';

  const btnNuevo = document.getElementById('btnNuevoCapitulo');
  if (btnNuevo) btnNuevo.style.display = soyAutor ? 'inline-block' : 'none';

  const btnPub = document.getElementById('btnPublicarAhora');
  if (btnPub) {
    const esPendiente = soyAutor && (h.esBorrador || (h.fechaPublicacion && new Date(h.fechaPublicacion) > new Date()));
    btnPub.style.display = esPendiente ? 'inline-block' : 'none';
  }

  actualizarBotonGuardar();
  actualizarBotonSeguir();
  renderizarEstrellas();

  document.getElementById('listaCapitulos').innerHTML = '<li style="cursor:default;color:#888;">⏳ Cargando...</li>';
  await cargarCapitulosDeHistoria(h.id);
  renderizarCapitulos();

  mostrarVista('lector');
}

document.getElementById('btnVolver').onclick = () => mostrarVista('inicio');
document.getElementById('btnEditarHistoria').onclick = () => prepararEdicionHistoria(historiaActual.id);

document.getElementById('btnPublicarAhora').onclick = async () => {
  if (!historiaActual) return;
  if (!esMiHistoria(historiaActual)) return;
  try {
    await actualizarHistoriaSupabase({ ...historiaActual, esBorrador: false, fechaPublicacion: null });
    toast('🚀 Historia publicada', 'success');
    await recargarHistorias();
    historiaActual = _historiasCache.find(h => h.id === historiaActual.id);
    if (historiaActual) abrirLector(historiaActual.id);
    else mostrarVista('publicar');
  } catch (e) { mostrarErrorCompleto(e, 'Error al publicar'); }
};

document.getElementById('btnEliminarHistoria').onclick = async () => {
  if (!historiaActual) return;
  if (!esMiHistoria(historiaActual)) { toast('No puedes eliminar historias de otros autores.', 'warn'); return; }
  if (!confirm('¿Seguro que quieres eliminar esta historia?')) return;
  try {
    await eliminarHistoriaSupabase(historiaActual.id);
    setBiblioteca(getBiblioteca().filter(id => id !== historiaActual.id));
    const hist = getHistorial(); delete hist[historiaActual.id]; setHistorial(hist);
    toast('Historia eliminada', 'info');
    await recargarHistorias();
    mostrarVista('inicio');
  } catch (e) { mostrarErrorCompleto(e, 'Error al eliminar'); }
};

document.getElementById('btnExportarPDF').onclick = async () => {
  if (!historiaActual) return;
  const h = historiaActual;
  toast('Preparando PDF...', 'info', 1500);

  const capsResueltos = (h.capitulos || []).map((c, i) => {
    let nota = '';
    if (c.notaAutor) {
      nota = `<div style="margin-top:20px;padding:12px 16px;background:#f5f5f5;border-left:4px solid #1976d2;border-radius:8px;">
        <strong style="color:#1976d2;text-transform:uppercase;font-size:.8rem;letter-spacing:1px;">✍️ Nota del autor</strong>
        <p style="margin-top:8px;">${escapeHtml(c.notaAutor)}</p>
      </div>`;
    }
    return `<h2 style="margin-top:40px;">Capítulo ${i + 1}: ${escapeHtml(c.titulo)}</h2>${c.contenido}${nota}`;
  });

  const w = window.open('', '_blank');
  if (!w) { toast('Permite las ventanas emergentes', 'warn'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(h.titulo)}</title>
    <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.6;color:#222}
    h1{text-align:center}h2{margin-top:40px;border-bottom:1px solid #ddd;padding-bottom:6px}
    p{margin-bottom:1em;text-align:justify}img{max-width:100%;height:auto;display:block;margin:16px auto;border-radius:8px}
    .sinopsis{font-style:italic;padding:14px;background:#f5f5f5;border-left:4px solid #1976d2;margin-bottom:30px}</style>
    </head><body>
    <h1>${escapeHtml(h.titulo)}</h1>
    <p style="text-align:center;color:#666">por ${escapeHtml(h.autor || 'Anónimo')}</p>
    <div class="sinopsis">${escapeHtml(h.sinopsis)}</div>
    ${capsResueltos.join('')}
    </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
};

function actualizarBotonGuardar() {
  const btn = document.getElementById('btnGuardar');
  btn.textContent = getBiblioteca().includes(historiaActual.id) ? '✅ Guardada' : '💾 Guardar';
}
document.getElementById('btnGuardar').onclick = () => {
  let bib = getBiblioteca();
  if (bib.includes(historiaActual.id)) bib = bib.filter(id => id !== historiaActual.id);
  else bib.push(historiaActual.id);
  setBiblioteca(bib);
  actualizarBotonGuardar();
};

function actualizarBotonSeguir() {
  const btn = document.getElementById('btnSeguirAutor');
  const autor = historiaActual.autor || 'Anónimo';
  if (esMiHistoria(historiaActual)) { btn.style.display = 'none'; return; }
  btn.style.display = 'inline-block';
  btn.textContent = getSiguiendo().includes(autor) ? '✅ Siguiendo' : '👥 Seguir autor';
}
document.getElementById('btnSeguirAutor').onclick = () => {
  const autor = historiaActual.autor || 'Anónimo';
  if (!autor || autor === 'Anónimo') return toast('Este autor no tiene nombre.', 'warn');
  if (esMiHistoria(historiaActual)) return;
  const lista = getSiguiendo();
  setSiguiendo(lista.includes(autor) ? lista.filter(a => a !== autor) : [...lista, autor]);
  actualizarBotonSeguir();
  toast(getSiguiendo().includes(autor) ? 'Siguiendo a ' + autor : 'Dejaste de seguir a ' + autor, 'info');
};

/* =========================================================
   ESTRELLAS (ocultas temporalmente)
========================================================= */
function renderizarEstrellas() {
  const cont = document.getElementById('estrellasValoracion');
  if (!cont) return;
  const bloqueValoracion = cont.closest('.valoracion');
  if (bloqueValoracion) bloqueValoracion.style.display = 'none';
}

function renderizarCapitulos() {
  const ul = document.getElementById('listaCapitulos');
  ul.innerHTML = '';
  if (!historiaActual.capitulos.length) {
    ul.innerHTML = '<li style="cursor:default;color:#888;">Sin capítulos aún</li>';
    return;
  }
  const total = historiaActual.capitulos.length;
  const soyAutor = esMiHistoria(historiaActual);

  historiaActual.capitulos.forEach((cap, idx) => {
    const li = document.createElement('li');
    const acciones = soyAutor ? `
      <div class="cap-acciones">
        <button class="btn-mover" data-accion="subir" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-mover" data-accion="bajar" data-idx="${idx}" ${idx === total - 1 ? 'disabled' : ''}>▼</button>
        <button data-accion="editar" data-idx="${idx}">✏️</button>
        <button data-accion="eliminar" data-idx="${idx}">🗑️</button>
      </div>` : '';

    li.innerHTML = `
      <div>
        <span class="cap-num">Cap. ${idx + 1}</span>
        <strong> ${escapeHtml(cap.titulo)}</strong>
        <div class="cap-num">${contarPalabras(cap.contenido)} palabras</div>
      </div>
      ${acciones}`;

    if (soyAutor) {
      li.querySelector('[data-accion="editar"]').onclick = ev => { ev.stopPropagation(); abrirEditorCapitulo(idx); };
      li.querySelector('[data-accion="eliminar"]').onclick = async ev => {
        ev.stopPropagation();
        if (!confirm('¿Eliminar capítulo?')) return;
        try {
          await eliminarCapituloSupabase(cap.id);
          await cargarCapitulosDeHistoria(historiaActual.id);
          renderizarCapitulos();
          toast('Capítulo eliminado', 'success');
        } catch (e) { mostrarErrorCompleto(e, 'Error al eliminar capítulo'); }
      };
      li.querySelector('[data-accion="subir"]').onclick = ev => { ev.stopPropagation(); moverCapitulo(idx, -1); };
      li.querySelector('[data-accion="bajar"]').onclick = ev => { ev.stopPropagation(); moverCapitulo(idx, 1); };
    }
    li.onclick = () => abrirCapitulo(idx);
    ul.appendChild(li);
  });
}

async function moverCapitulo(idx, direccion) {
  if (!esMiHistoria(historiaActual)) return;
  const nuevoIdx = idx + direccion;
  if (nuevoIdx < 0 || nuevoIdx >= historiaActual.capitulos.length) return;

  const caps = historiaActual.capitulos;
  const temp = caps[idx]; caps[idx] = caps[nuevoIdx]; caps[nuevoIdx] = temp;

  try {
    for (let i = 0; i < caps.length; i++) {
      await actualizarCapituloSupabase(caps[i].id, caps[i].titulo, caps[i].contenido, caps[i].notaAutor, i + 1);
    }
    await cargarCapitulosDeHistoria(historiaActual.id);
    renderizarCapitulos();
    toast('Capítulos reordenados', 'info', 1200);
  } catch (e) { mostrarErrorCompleto(e, 'Error al reordenar'); }
}

document.getElementById('btnNuevoCapitulo').onclick = () => {
  if (!esMiHistoria(historiaActual)) { toast('No puedes añadir capítulos a historias de otros autores.', 'warn'); return; }
  abrirEditorCapitulo(null);
};

/* =========================================================
   EDITOR DE CAPÍTULO
========================================================= */
let capituloEditandoIdx = null;
const editor = document.getElementById('editorContenido');
let autosaveTimer = null;

async function abrirEditorCapitulo(idx) {
  if (!esMiHistoria(historiaActual)) { toast('No puedes editar capítulos de otros autores.', 'warn'); return; }
  capituloEditandoIdx = idx;
  if (idx === null) {
    document.getElementById('tituloEditorCapitulo').textContent = 'Nuevo capítulo';
    document.getElementById('tituloCapituloInput').value = '';
    document.getElementById('notaAutor').value = '';
    editor.innerHTML = '';
  } else {
    const cap = historiaActual.capitulos[idx];
    document.getElementById('tituloEditorCapitulo').textContent = 'Editar capítulo';
    document.getElementById('tituloCapituloInput').value = cap.titulo;
    document.getElementById('notaAutor').value = cap.notaAutor || '';
    editor.innerHTML = cap.contenido;
  }
  actualizarContador();
  document.getElementById('autosaveEstado').textContent = '';
  mostrarVista('editorCapitulo');
}

function actualizarContador() {
  const p = contarPalabras(editor.innerHTML);
  document.getElementById('contadorPalabras').textContent = `${p} palabras · ${minutosLectura(p)} min`;
}

editor.addEventListener('input', () => {
  actualizarContador();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const txt = editor.innerHTML.trim();
    if (!txt || txt === '<br>') return;
    document.getElementById('autosaveEstado').textContent = '💾 ' + new Date().toLocaleTimeString().slice(0, 5);
  }, 1500);
});

document.querySelectorAll('.barra-editor button').forEach(btn => {
  if (btn.id === 'btnInsertarImagen') return;
  btn.onclick = () => {
    editor.focus();
    const cmd = btn.dataset.cmd;
    if (!cmd) return;
    if (cmd === 'formatBlock') document.execCommand(cmd, false, btn.dataset.value);
    else document.execCommand(cmd, false, null);
    actualizarContador();
  };
});

document.getElementById('btnInsertarImagen').onclick = () => {
  document.getElementById('inputImagenCap').click();
};

document.getElementById('inputImagenCap').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  const v = validarImagen(f);
  if (!v.ok) {
    if (v.motivo === 'pesada') toast(`La imagen pesa ${v.mb} MB. Máximo 3 MB.`, 'error', 5000);
    else if (v.motivo === 'formato') toast('Solo PNG o JPG', 'error');
    e.target.value = '';
    return;
  }
  try {
    const base64 = await redimensionarImagen(f, 800);
    editor.focus();
    document.execCommand('insertHTML', false, `<img src="${base64}" style="max-width:100%;border-radius:8px;margin:12px 0;">`);
    actualizarContador();
    toast('Imagen insertada', 'success', 1500);
  } catch (err) { toast('No se pudo procesar la imagen', 'error'); }
  e.target.value = '';
};

document.getElementById('btnCancelarCapitulo').onclick = () => abrirLector(historiaActual.id);

document.getElementById('formCapitulo').onsubmit = async e => {
  e.preventDefault();
  const titulo = document.getElementById('tituloCapituloInput').value.trim();
  const notaAutor = document.getElementById('notaAutor').value.trim();
  const contenido = editor.innerHTML.trim();
  if (!titulo) { toast('Falta el título del capítulo', 'error'); return; }
  if (!contenido || contenido === '<br>') { toast('El capítulo no tiene contenido', 'error'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const orden = capituloEditandoIdx === null
      ? historiaActual.capitulos.length + 1
      : historiaActual.capitulos[capituloEditandoIdx].orden;

    if (capituloEditandoIdx === null) {
      await crearCapituloSupabase(historiaActual.id, titulo, contenido, notaAutor, orden);
    } else {
      const capViejo = historiaActual.capitulos[capituloEditandoIdx];
      await actualizarCapituloSupabase(capViejo.id, titulo, contenido, notaAutor, orden);
    }

    toast('✅ Capítulo guardado', 'success');
    await cargarCapitulosDeHistoria(historiaActual.id);
    abrirLector(historiaActual.id);
  } catch (err) {
    mostrarErrorCompleto(err, 'Error al guardar capítulo');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar capítulo';
  }
};

/* =========================================================
   LEER CAPÍTULO
========================================================= */
let ttsActivo = false;

async function abrirCapitulo(idx) {
  capituloActualIdx = idx;
  const cap = historiaActual.capitulos[idx];
  document.getElementById('detalleHistoria').style.display = 'none';
  document.getElementById('vistaLecturaCapitulo').style.display = 'block';

  document.getElementById('tituloCapitulo').textContent = cap.titulo;
  const p = contarPalabras(cap.contenido);
  document.getElementById('metaCapitulo').textContent =
    `Capítulo ${idx + 1} de ${historiaActual.capitulos.length} · ${p} palabras · ${minutosLectura(p)} min`;

  const cont = document.getElementById('contenidoCapitulo');
  cont.innerHTML = '';

  if (idx === 0 && historiaActual.dedicatoria) {
    const ded = document.createElement('div');
    ded.className = 'dedicatoria';
    ded.textContent = '💝 ' + historiaActual.dedicatoria;
    cont.appendChild(ded);
  }

  const cuerpo = document.createElement('div');
  cuerpo.innerHTML = cap.contenido;
  cont.appendChild(cuerpo);

  if (cap.notaAutor && cap.notaAutor.trim()) {
    const nota = document.createElement('div');
    nota.className = 'nota-autor';
    nota.innerHTML = `<div class="nota-autor-titulo">✍️ Nota del autor</div><div>${escapeHtml(cap.notaAutor)}</div>`;
    cont.appendChild(nota);
  }

  document.getElementById('btnCapAnterior').style.display = idx > 0 ? 'inline-block' : 'none';
  document.getElementById('btnCapSiguiente').style.display = idx < historiaActual.capitulos.length - 1 ? 'inline-block' : 'none';

  cont.classList.remove('fade-in-capitulo');
  void cont.offsetWidth;
  cont.classList.add('fade-in-capitulo');

  const hist = getHistorial();
  hist[historiaActual.id] = { capituloIdx: idx, fecha: new Date().toISOString() };
  setHistorial(hist);

  detenerTTS();
  renderizarComentarios(idx);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('btnVolverCapitulos').onclick = () => {
  detenerTTS();
  salirDePantallaCompleta();
  abrirLector(historiaActual.id);
};
document.getElementById('btnCapAnterior').onclick = () => abrirCapitulo(capituloActualIdx - 1);
document.getElementById('btnCapSiguiente').onclick = () => abrirCapitulo(capituloActualIdx + 1);

const ajustesL = () => getAjustes().lectura;
const guardarLectura = l => { const a = getAjustes(); a.lectura = l; setAjustes(a); aplicarLectura(); };
document.getElementById('btnLecturaMenos').onclick = () => { const l = ajustesL(); l.tamano = Math.max(14, l.tamano - 2); guardarLectura(l); };
document.getElementById('btnLecturaMas').onclick = () => { const l = ajustesL(); l.tamano = Math.min(26, l.tamano + 2); guardarLectura(l); };
document.getElementById('btnLecturaSerif').onclick = () => { const l = ajustesL(); l.familia = 'serif'; guardarLectura(l); };
document.getElementById('btnLecturaSans').onclick = () => { const l = ajustesL(); l.familia = 'sans'; guardarLectura(l); };
document.getElementById('btnLecturaAncho').onclick = () => { const l = ajustesL(); l.ancho = l.ancho >= 900 ? 480 : l.ancho + 140; guardarLectura(l); };

document.getElementById('btnSepia').onclick = () => {
  document.body.classList.toggle('sepia');
  toast(document.body.classList.contains('sepia') ? 'Modo sepia activado' : 'Modo sepia desactivado', 'info', 1500);
};

document.getElementById('btnPantallaCompleta').onclick = () => {
  document.body.classList.add('modo-pantalla-completa');
  document.getElementById('btnSalirPantallaCompleta').style.display = 'flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('btnSalirPantallaCompleta').onclick = salirDePantallaCompleta;

window.addEventListener('popstate', (e) => {
  if (document.body.classList.contains('modo-pantalla-completa')) {
    e.preventDefault();
    salirDePantallaCompleta();
    history.pushState(null, '', location.href);
  }
});
if (typeof history !== 'undefined') {
  history.pushState(null, '', location.href);
}

function detenerTTS() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  ttsActivo = false;
  const b = document.getElementById('btnTTS');
  if (b) b.classList.remove('tts-activo');
}

document.getElementById('btnTTS').onclick = () => {
  if (!('speechSynthesis' in window)) { toast('Tu navegador no soporta texto a voz', 'warn'); return; }
  const btn = document.getElementById('btnTTS');
  if (ttsActivo) { detenerTTS(); toast('Lectura detenida', 'info', 1500); return; }

  const cap = historiaActual.capitulos[capituloActualIdx];
  const textoPlano = cap.contenido.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!textoPlano) return;

  const utt = new SpeechSynthesisUtterance(textoPlano);
  utt.lang = 'es-ES';
  utt.onend = () => { ttsActivo = false; btn.classList.remove('tts-activo'); };
  utt.onerror = () => { ttsActivo = false; btn.classList.remove('tts-activo'); };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
  ttsActivo = true;
  btn.classList.add('tts-activo');
  toast('🔊 Leyendo en voz alta...', 'info', 2000);
};

function renderizarComentarios(idx) {
  const cont = document.getElementById('listaComentarios');
  cont.innerHTML = '';
  const comentarios = (historiaActual.comentarios && historiaActual.comentarios[idx]) || [];
  if (!comentarios.length) { cont.innerHTML = '<p style="color:#888;font-size:.9rem;">Sé el primero en comentar.</p>'; return; }
  comentarios.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comentario';
    div.innerHTML = `
      <span class="autor">${escapeHtml(c.autor)}</span>
      <span class="fecha">${new Date(c.fecha).toLocaleDateString()}</span>
      <p>${escapeHtml(c.texto)}</p>`;
    cont.appendChild(div);
  });
}

document.getElementById('formComentario').onsubmit = e => {
  e.preventDefault();
  const texto = document.getElementById('inputComentario').value.trim();
  if (!texto) return;
  toast('💬 Comentario enviado (pendiente de sync)', 'info', 2000);
  document.getElementById('inputComentario').value = '';
};

/* =========================================================
   PERFIL
========================================================= */
let fotoPerfilTemp = null;

async function renderizarPerfil() {
  if (!perfilActual) return;

  document.getElementById('perfilHeaderNombre').textContent =
    ((perfilActual.nombre || '') + ' ' + (perfilActual.apellido || '')).trim() || perfilActual.username || 'Anónimo';
  document.getElementById('perfilHeaderUsername').textContent = '@' + (perfilActual.username || 'anonimo');

  const badge = document.getElementById('perfilHeaderModo');
  if (edadUsuario) {
    if (edadUsuario.esMenor) {
      badge.textContent = `👶 Menor de edad · ${edadUsuario.anios} años`;
      badge.className = 'perfil-badge menor';
    } else {
      badge.textContent = `✅ Mayor de edad · ${edadUsuario.anios} años`;
      badge.className = 'perfil-badge';
    }
  } else {
    badge.textContent = 'Edad no especificada';
    badge.className = 'perfil-badge';
  }

  document.getElementById('perfilHeaderMiembro').textContent = '🎂 ' + formatearMiembroDesde(perfilActual.created_at);

  const av = document.getElementById('perfilAvatar');
  if (perfilActual.avatar_url) {
    av.innerHTML = `<img src="${perfilActual.avatar_url}" alt="" onerror="this.style.display='none'; this.parentElement.textContent='${perfilActual.emoji || '👤'}';">`;
    document.getElementById('btnQuitarFoto').style.display = 'inline-block';
  } else {
    av.textContent = perfilActual.emoji || '👤';
    document.getElementById('btnQuitarFoto').style.display = 'none';
  }
  fotoPerfilTemp = null;

  document.getElementById('perfilNombreReal').value = perfilActual.nombre || '';
  document.getElementById('perfilApellido').value = perfilActual.apellido || '';
  document.getElementById('perfilGenero').value = perfilActual.genero || '';
  document.getElementById('perfilFechaNacimiento').value = perfilActual.fecha_nacimiento || '';

  document.getElementById('perfilEdadMostrada').textContent = edadUsuario ? edadUsuario.anios + ' años' : '—';
  document.getElementById('perfilModoMostrado').textContent = edadUsuario
    ? (edadUsuario.esMenor ? '👶 Menor de edad' : '✅ Mayor de edad')
    : '—';
  document.getElementById('perfilMiembroDesdeMostrado').textContent = formatearMiembroDesde(perfilActual.created_at) || '—';

  document.getElementById('perfilNombre').value = perfilActual.username || 'Anónimo';
  document.getElementById('perfilBio').value = perfilActual.bio || '';
  document.getElementById('perfilEmoji').value = perfilActual.emoji || '👤';

  const cont = document.getElementById('misHistorias');
  cont.innerHTML = '<p style="color:#888;">⏳ Cargando...</p>';
  const mis = await misHistoriasSupabase();
  cont.innerHTML = '';
  if (!mis.length) cont.innerHTML = '<p style="color:#888;">Aún no has publicado historias.</p>';
  else mis.forEach(h => cont.appendChild(crearTarjeta(h)));
}

document.getElementById('perfilFoto').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  const v = validarImagen(f);
  if (!v.ok) {
    if (v.motivo === 'pesada') toast(`La imagen pesa ${v.mb} MB. Máximo 3 MB.`, 'error', 5000);
    else if (v.motivo === 'formato') toast('Solo PNG o JPG', 'error');
    e.target.value = '';
    return;
  }
  try {
    const base64 = await redimensionarImagen(f, 300);
    fotoPerfilTemp = base64;
    document.getElementById('perfilAvatar').innerHTML = `<img src="${fotoPerfilTemp}">`;
    document.getElementById('btnQuitarFoto').style.display = 'inline-block';
  } catch (err) { toast('Error al procesar imagen', 'error'); }
};

document.getElementById('btnQuitarFoto').onclick = () => {
  fotoPerfilTemp = null;
  perfilActual.avatar_url = null;
  document.getElementById('perfilAvatar').textContent = perfilActual.emoji || '👤';
  document.getElementById('btnQuitarFoto').style.display = 'none';
};

document.getElementById('formPerfil').onsubmit = async e => {
  e.preventDefault();

  const nombre = document.getElementById('perfilNombreReal').value.trim();
  const apellido = document.getElementById('perfilApellido').value.trim();
  const genero = document.getElementById('perfilGenero').value;
  const username = document.getElementById('perfilNombre').value.trim() || 'Anónimo';
  const bio = document.getElementById('perfilBio').value.trim();
  const emoji = document.getElementById('perfilEmoji').value.trim() || '👤';

  const btn = e.target.querySelector('button[type="submit"]');
  const textoOriginal = btn.textContent;
  btn.disabled = true;

  try {
    let avatarUrl = perfilActual.avatar_url || null;

    if (fotoPerfilTemp) {
      btn.textContent = 'Subiendo foto...';
      try {
        avatarUrl = await subirAvatarBase64Supabase(fotoPerfilTemp);
        console.log('✅ Avatar subido:', avatarUrl);
      } catch (errFoto) {
        console.error('Error subiendo avatar:', errFoto);
        toast('⚠️ No se pudo subir la foto, pero se guardará el resto del perfil.', 'warn', 5000);
        avatarUrl = perfilActual.avatar_url || null;
      }
    }

    btn.textContent = 'Guardando...';

    perfilActual = {
      ...perfilActual,
      nombre, apellido, genero,
      username, bio, emoji,
      avatar_url: avatarUrl
    };

    await guardarPerfilSupabase({
      username,
      nombre,
      apellido,
      genero,
      bio,
      emoji,
      avatar_url: avatarUrl
    });

    for (const h of _historiasCache) {
      if (h.user_id === usuarioActual.id) {
        await actualizarHistoriaSupabase({ ...h, autor: username, autorFoto: avatarUrl });
      }
    }

    toast('✅ Perfil guardado', 'success');
    fotoPerfilTemp = null;
    actualizarAvatarCabecera();
    actualizarDrawerUsuario();
    actualizarSidebarUsuario();
    await recargarHistorias();
    await renderizarPerfil();
  } catch (err) {
    mostrarErrorCompleto(err, 'Error al guardar perfil');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
};

/* =========================================================
   TEMA Y COLOR
========================================================= */
const COLORES = ['rojo', 'verde', 'vino', 'azul', 'morado', 'purpura', 'dorado', 'amarillo', 'gris', 'naranja'];

function aplicarTemaYColor() {
  const a = getAjustes();
  COLORES.forEach(c => document.body.classList.remove('color-' + c));
  document.body.classList.toggle('modo-oscuro', a.tema === 'oscuro');
  document.body.classList.toggle('sepia', a.tema === 'sepia');
  if (a.color && a.color !== 'ninguno') document.body.classList.add('color-' + a.color);

  document.querySelectorAll('.color-btn').forEach(b => {
    b.classList.remove('seleccionado');
    const colorBtn = b.dataset.color;
    if (a.color === 'azul' && colorBtn === 'predeterminado') b.classList.add('seleccionado');
    else if (a.color !== 'azul' && colorBtn === a.color) b.classList.add('seleccionado');
  });
}

function crearPaleta() {
  const paleta = document.getElementById('paletaColores');
  if (!paleta) return;
  paleta.innerHTML = '';

  const sin = document.createElement('button');
  sin.className = 'color-btn';
  sin.style.background = '#fafafa';
  sin.style.border = '3px solid #c0c0c0';
  sin.title = 'Predeterminado (azul)';
  sin.dataset.color = 'predeterminado';
  sin.textContent = 'A';
  sin.style.color = '#1976d2';
  sin.style.fontWeight = '800';
  sin.onclick = () => { const a = getAjustes(); a.color = 'azul'; setAjustes(a); aplicarTemaYColor(); };
  paleta.appendChild(sin);

  COLORES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'color-btn';
    b.dataset.color = c;
    b.title = c;
    b.onclick = () => { const a = getAjustes(); a.color = c; setAjustes(a); aplicarTemaYColor(); };
    paleta.appendChild(b);
  });
}

document.getElementById('btnModoClaro').onclick = () => { const a = getAjustes(); a.tema = 'claro'; setAjustes(a); aplicarTemaYColor(); };
document.getElementById('btnModoOscuro').onclick = () => { const a = getAjustes(); a.tema = 'oscuro'; setAjustes(a); aplicarTemaYColor(); };
document.getElementById('btnModoSepia').onclick = () => { const a = getAjustes(); a.tema = 'sepia'; setAjustes(a); aplicarTemaYColor(); };

function aplicarLectura() {
  const l = getAjustes().lectura;
  const familia = l.familia === 'sans' ? "'Segoe UI', Roboto, sans-serif" : "Georgia, 'Times New Roman', serif";
  document.body.style.setProperty('--lectura-tamano', l.tamano + 'px');
  document.body.style.setProperty('--lectura-interlineado', l.interlineado);
  document.body.style.setProperty('--lectura-ancho', l.ancho + 'px');
  document.body.style.setProperty('--lectura-familia', familia);
  if (document.getElementById('sliderTamano')) {
    document.getElementById('sliderTamano').value = l.tamano;
    document.getElementById('sliderInter').value = Math.round(l.interlineado * 10);
    document.getElementById('sliderAncho').value = l.ancho;
    document.getElementById('lblTamano').textContent = l.tamano + 'px';
    document.getElementById('lblInter').textContent = l.interlineado.toFixed(1);
    document.getElementById('lblAncho').textContent = l.ancho + 'px';
  }
}

function renderizarAjustes() {
  aplicarLectura();
  aplicarTemaYColor();
  const a = getAjustes();
  const tg = document.getElementById('toggleScrollInfinito');
  if (tg) tg.checked = !!a.scrollInfinito;
}

document.getElementById('sliderTamano').oninput = e => { const l = ajustesL(); l.tamano = +e.target.value; guardarLectura(l); };
document.getElementById('sliderInter').oninput = e => { const l = ajustesL(); l.interlineado = +e.target.value / 10; guardarLectura(l); };
document.getElementById('sliderAncho').oninput = e => { const l = ajustesL(); l.ancho = +e.target.value; guardarLectura(l); };
document.getElementById('btnFuenteSerif').onclick = () => { const l = ajustesL(); l.familia = 'serif'; guardarLectura(l); };
document.getElementById('btnFuenteSans').onclick = () => { const l = ajustesL(); l.familia = 'sans'; guardarLectura(l); };
document.getElementById('btnResetLectura').onclick = () => {
  const a = getAjustes(); a.lectura = { ...ajustesDefault.lectura }; setAjustes(a); aplicarLectura();
  toast('Modo lectura restablecido', 'info');
};

document.getElementById('toggleScrollInfinito').onchange = e => {
  const a = getAjustes(); a.scrollInfinito = e.target.checked; setAjustes(a);
  toast(e.target.checked ? 'Scroll infinito activado' : 'Scroll infinito desactivado', 'info', 1800);
};

/* =========================================================
   INICIALIZACIÓN
========================================================= */
async function iniciar() {
  crearPaleta();
  aplicarTemaYColor();
  aplicarLectura();

  renderizarGridGeneros();
  renderizarGridSubgeneros();
  actualizarContadorGenero();
  actualizarContadorSubgeneros();

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      await inicializarApp(session.user);
    } else {
      mostrarBienvenida();
    }
  } catch (err) {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    mostrarBienvenida();
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && session.user && !usuarioActual) {
      inicializarApp(session.user);
    }
    if (event === 'SIGNED_OUT') {
      usuarioActual = null;
      perfilActual = null;
      edadUsuario = null;
      _historiasCache = [];
      detenerCarrusel();
      mostrarBienvenida();
    }
  });
}

iniciar();

/* =========================================================
   SERVICE WORKER
========================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('SW no registrado:', err);
    });
  });
}
