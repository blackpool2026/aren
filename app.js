/* =========================================================
   AREN — App con multiusuario real (Supabase)
========================================================= */

/* ---------- CONFIGURACIÓN SUPABASE ---------- */
const SUPABASE_URL = 'https://kimchxupqqxnjkmssbtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbWNoeHVwcXF4bmprbXNzYnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMzM1MzIsImV4cCI6MjEwNDkwOTUzMn0.nus6tR4eaeVrQNjG86epuABUS7f97QgRm7vLnZ58TXI';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usuarioActual = null;
let perfilActual = null;
let _historiasCache = [];

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
  color: 'naranja',
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
   INDEXEDDB (caché local de imágenes viejas)
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
    subgenero: s.subgenre || '',
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
    p_subgenre: h.subgenero || '',
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
   STORAGE: PORTADAS (bucket "Portadas")
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
  const btnFlotante = document.getElementById('btnPublicarFlotante');
  if (btnFlotante) btnFlotante.style.display = 'flex';
}

document.getElementById('btnIrLogin').onclick = mostrarLogin;
document.getElementById('btnIrRegistro').onclick = mostrarRegistro;
document.getElementById('btnVolverBienvenida1').onclick = mostrarBienvenida;
document.getElementById('btnVolverBienvenida2').onclick = mostrarBienvenida;
document.getElementById('linkIrRegistro').onclick = e => { e.preventDefault(); mostrarRegistro(); };
document.getElementById('linkIrLogin').onclick = e => { e.preventDefault(); mostrarLogin(); };

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
    if (error) toast('⚠️ Storage: ' + error.message, 'warn', 6000);
    else toast('✅ Storage "Portadas": OK', 'success', 5000);
  } catch (e) {
    toast('❌ Storage falló: ' + e.message, 'error', 6000);
  }
};

/* =========================================================
   REGISTRO
========================================================= */
document.getElementById('formRegistro').onsubmit = async e => {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const btn = document.getElementById('btnRegistroSubmit');

  if (!username) { toast('Falta el nombre de usuario', 'error'); return; }
  if (!email) { toast('Falta el correo', 'error'); return; }
  if (password.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { username, emoji: '👤' },
        emailRedirectTo: window.location.origin
      }
    });

    if (error) { mostrarErrorCompleto(error, 'Error al registrar'); return; }

    const requiereConfirmacion = data && data.user && !data.session;
    if (requiereConfirmacion) toast('✅ ¡Cuenta creada! Revisa tu correo.', 'success', 8000);
    else toast('✅ ¡Cuenta creada! Ya puedes entrar.', 'success', 5000);

    document.getElementById('formRegistro').reset();
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
document.getElementById('btnCerrarSesion').onclick = async () => {
  if (!confirm('¿Cerrar sesión?')) return;
  try {
    await supabaseClient.auth.signOut();
    usuarioActual = null;
    perfilActual = null;
    _historiasCache = [];
    for (const k in cacheImagenes) delete cacheImagenes[k];
    toast('Sesión cerrada', 'info');
    mostrarBienvenida();
  } catch (err) {
    toast('Error al cerrar sesión', 'error');
  }
};

/* =========================================================
   INICIALIZAR APP
========================================================= */
async function inicializarApp(user) {
  usuarioActual = user;

  const clave = 'aren_perfil_' + user.id;
  try {
    const guardado = localStorage.getItem(clave);
    if (guardado) perfilActual = JSON.parse(guardado);
    else {
      try {
        const { data } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        if (data) perfilActual = data;
        else throw new Error('sin datos');
      } catch (e) {
        perfilActual = {
          username: (user.user_metadata && user.user_metadata.username) || user.email.split('@')[0] || 'Anónimo',
          emoji: '👤', bio: '', avatar_url: null,
        };
      }
    }
  } catch (e) {
    perfilActual = {
      username: (user.user_metadata && user.user_metadata.username) || user.email.split('@')[0] || 'Anónimo',
      emoji: '👤', bio: '', avatar_url: null,
    };
  }

  actualizarAvatarCabecera();

  const drawerUser = document.getElementById('drawerUsuario');
  if (drawerUser) {
    drawerUser.innerHTML = `
      <span class="nombre-drawer">${escapeHtml(perfilActual.username || 'Anónimo')}</span>
      ${escapeHtml(user.email || '')}
    `;
  }

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
    btn.innerHTML = `<img src="${perfilActual.avatar_url}" alt="">`;
  } else {
    btn.textContent = (perfilActual && perfilActual.emoji) || '👤';
  }
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

async function mostrarVista(nombre) {
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

  /* Mostrar botón flotante solo en Inicio */
  const btnFlotante = document.getElementById('btnPublicarFlotante');
  if (btnFlotante) {
    btnFlotante.style.display = (nombre === 'inicio') ? 'flex' : 'none';
  }

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

document.getElementById('btnPerfilTop').onclick = () => mostrarVista('perfil');

document.getElementById('btnPublicarFlotante').onclick = () => {
  prepararNuevaHistoria();
  mostrarVista('publicar');
  activarTabPublicar('formulario');
};

/* =========================================================
   GÉNEROS
========================================================= */
const GENEROS = {
  'Romance':           ['Contemporáneo', 'Histórico', 'Juvenil', 'Paranormal', 'Adulto'],
  'Fantasía':          ['Épica', 'Urbana', 'Oscura', 'Romántica', 'Juvenil'],
  'Ciencia Ficción':   ['Distopía', 'Espacial', 'Cyberpunk', 'Post-apocalíptico', 'Viaje en el tiempo'],
  'Misterio':          ['Policial', 'Noir', 'Suspenso', 'Thriller psicológico', 'Enigma'],
  'Terror':            ['Gótico', 'Sobrenatural', 'Psicológico', 'Slasher', 'Cósmico'],
  'Aventura':          ['Supervivencia', 'Exploración', 'Piratas', 'Western', 'Viajes'],
  'Drama':             ['Familiar', 'Juvenil', 'Social', 'Médico', 'Escolar'],
  'Poesía':            ['Lírica', 'Épica', 'Verso libre', 'Haiku', 'Prosa poética'],
  'Histórico':         ['Medieval', 'Victoriano', 'Bélico', 'Antiguo', 'Revolución'],
  'Juvenil':           ['Adolescente', 'Coming of age', 'Colegio', 'Amistad', 'Primer amor'],
  'Fanfic':            ['Anime', 'Videojuegos', 'Series', 'Películas', 'Libros'],
  'Humor':             ['Satírico', 'Absurdo', 'Comedia romántica', 'Parodia', 'Stand-up'],
  'No ficción':        ['Ensayo', 'Biografía', 'Autoayuda', 'Memorias', 'Divulgación'],
  'Erótico':           ['Romance', 'Contemporáneo', 'Suspenso', 'Fantástico', 'Drama'],
  'Espiritual':        ['Inspiracional', 'Religioso', 'Filosófico', 'Meditación', 'Místico'],
  'Superhéroes':       ['Originales', 'Poderes', 'Vigilantes', 'Academia', 'Oscuro'],
  'Vampírico':         ['Romance', 'Oscuro', 'Juvenil', 'Histórico', 'Urbano'],
  'Zombis':            ['Apocalipsis', 'Supervivencia', 'Comedia', 'Drama', 'Acción'],
  'Steampunk':         ['Victoriano', 'Fantástico', 'Aventura', 'Misterio', 'Romance'],
  'Mitología':         ['Griega', 'Nórdica', 'Egipcia', 'Japonesa', 'Latinoamericana'],
  'Deportes':          ['Fútbol', 'Baloncesto', 'Atletismo', 'Artes marciales', 'Boxeo'],
  'Música':            ['Rock', 'Pop', 'Clásica', 'Urbana', 'Romance'],
  'Realeza':           ['Fantasía', 'Histórico', 'Romance', 'Drama', 'Contemporáneo'],
  'Distopía':          ['Política', 'Científica', 'Juvenil', 'Social', 'Post-apocalíptica'],
  'Espías':            ['Thriller', 'Acción', 'Político', 'Romance', 'Histórico'],
  'Magia':             ['Academia', 'Oscura', 'Elemental', 'Antigua', 'Prohibida'],
  'Ángeles y Demonios':['Urbano', 'Romance', 'Épico', 'Oscuro', 'Juvenil'],
  'Sirenas':           ['Fantasía', 'Romance', 'Aventura', 'Oscuro', 'Juvenil'],
  'Viajes en el tiempo':['Paradoja', 'Histórico', 'Futurista', 'Romance', 'Aventura'],
  'Supervivencia':     ['Isla desierta', 'Post-apocalíptico', 'Selva', 'Montaña', 'Espacial'],
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

  const prom = promedioEstrellas(h);
  const palabras = totalPalabrasHistoria(h);
  const autor = h.autor || 'Anónimo';
  const esMia = esMiHistoria(h);

  let badgeEspecial = '';
  if (h.esBorrador) {
    badgeEspecial = '<span class="badge-borrador">📝 Borrador</span>';
  } else if (h.fechaPublicacion && new Date(h.fechaPublicacion) > new Date()) {
    const f = new Date(h.fechaPublicacion);
    badgeEspecial = `<span class="badge-programada">🕒 ${f.toLocaleDateString()}</span>`;
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'tarjeta-info';
  infoDiv.innerHTML = `
    <h3>${escapeHtml(h.titulo)}</h3>
    <p class="autor-mini">por ${escapeHtml(autor)}${esMia ? ' <span style="color:#43a047;">(tú)</span>' : ''}</p>
    <p>${escapeHtml(h.genero)}${h.subgenero ? ' · ' + escapeHtml(h.subgenero) : ''}</p>
    <p>${h.capitulos.length} cap. · ${palabras} palabras · ${minutosLectura(palabras)} min</p>
    ${prom > 0 ? `<p class="estrellitas">${estrellitas(prom)} ${prom}</p>` : ''}
    ${badgeEspecial}
    <span class="badge-estado">${escapeHtml(h.estado || 'En curso')}</span>
    ${h.etiquetas.slice(0, 4).map(e => `<span class="etiqueta">#${escapeHtml(e)}</span>`).join('')}
  `;

  div.appendChild(portadaDiv);
  div.appendChild(infoDiv);
  div.onclick = () => abrirLector(h.id);
  return div;
}

/* =========================================================
   VISTAS: INICIO / CATÁLOGO / BIBLIOTECA / HISTORIAL
========================================================= */
async function renderizarHistorias(filtro = '') {
  const cont = document.getElementById('listaHistorias');
  const vacio = document.getElementById('mensajeVacio');
  cont.innerHTML = '<p class="mensaje-vacio">⏳ Cargando...</p>';
  vacio.style.display = 'none';

  await recargarHistorias();

  cont.innerHTML = '';
  const historias = _historiasCache.filter(esVisible).filter(h => {
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
    ['Todos', ...Object.keys(GENEROS)].forEach(g => {
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
  const historias = _historiasCache.filter(esVisible).filter(h => generoFiltro === 'Todos' || h.genero === generoFiltro);
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
  const historias = _historiasCache.filter(h => ids.includes(h.id));
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

/* =========================================================
   SIGUIENDO
========================================================= */
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
   PUBLICAR: PESTAÑAS
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

const selGenero = document.getElementById('genero');
const selSubgenero = document.getElementById('subgenero');
Object.keys(GENEROS).forEach(g => {
  const o = document.createElement('option'); o.textContent = g; selGenero.appendChild(o);
});
function actualizarSubgeneros() {
  selSubgenero.innerHTML = '';
  (GENEROS[selGenero.value] || []).forEach(s => {
    const o = document.createElement('option'); o.textContent = s; selSubgenero.appendChild(o);
  });
}
selGenero.onchange = actualizarSubgeneros;
actualizarSubgeneros();

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
  selGenero.selectedIndex = 0;
  actualizarSubgeneros();
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
  document.getElementById('genero').value = h.genero;
  actualizarSubgeneros();
  if (h.subgenero) document.getElementById('subgenero').value = h.subgenero;
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
  mostrarVista('publicar');
  activarTabPublicar('formulario');
}

document.getElementById('formHistoria').onsubmit = async e => {
  e.preventDefault();
  const titulo = document.getElementById('titulo').value.trim();
  const autor = document.getElementById('autor').value.trim();
  const dedicatoria = document.getElementById('dedicatoria').value.trim();
  const sinopsis = document.getElementById('sinopsis').value.trim();
  const genero = selGenero.value;
  const subgenero = selSubgenero.value;
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
   LECTOR (CORREGIDO: también encuentra borradores)
========================================================= */
let historiaActual = null;
let capituloActualIdx = 0;

async function abrirLector(id) {
  /* Buscar primero en la caché pública */
  let h = _historiasCache.find(x => x.id === id);

  /* Si no está, buscar en mis historias (incluye borradores) */
  if (!h) {
    try {
      const mis = await misHistoriasSupabase();
      h = mis.find(x => x.id === id);
    } catch (e) {
      console.error('Error buscando historia:', e);
    }
  }

  /* Si aún no se encuentra, volver a inicio */
  if (!h) {
    toast('No se encontró la historia', 'warn');
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
  document.getElementById('lectorMeta').innerHTML =
    `${escapeHtml(h.genero)}${h.subgenero ? ' · ' + escapeHtml(h.subgenero) : ''} · ${h.estado || 'En curso'} · ${h.capitulos.length} capítulos`;

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
  document.getElementById('btnEditarHistoria').style.display = soyAutor ? 'inline-block' : 'none';
  document.getElementById('btnEliminarHistoria').style.display = soyAutor ? 'inline-block' : 'none';
  document.getElementById('btnNuevoCapitulo').style.display = soyAutor ? 'inline-block' : 'none';
  const btnPub = document.getElementById('btnPublicarAhora');
  const esPendiente = soyAutor && (h.esBorrador || (h.fechaPublicacion && new Date(h.fechaPublicacion) > new Date()));
  btnPub.style.display = esPendiente ? 'inline-block' : 'none';

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
      nota = `<div style="margin-top:20px;padding:12px 16px;background:#f5f5f5;border-left:4px solid #ff6b35;border-radius:8px;">
        <strong style="color:#ff6b35;text-transform:uppercase;font-size:.8rem;letter-spacing:1px;">✍️ Nota del autor</strong>
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
    .sinopsis{font-style:italic;padding:14px;background:#f5f5f5;border-left:4px solid #ff6b35;margin-bottom:30px}</style>
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

function renderizarEstrellas() {
  const cont = document.getElementById('estrellasValoracion');
  const prom = promedioEstrellas(historiaActual);
  cont.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'estrella' + (i <= Math.round(prom) ? ' activa' : '');
    btn.textContent = '★';
    btn.onclick = () => toast('⭐ Valoración registrada localmente', 'info', 2000);
    cont.appendChild(btn);
  }
  document.getElementById('promedioValoracion').textContent =
    prom > 0 ? `(${prom} / 5 · ${historiaActual.valoraciones.length} votos)` : '(sin votos)';
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

  const hist = getHistorial();
  hist[historiaActual.id] = { capituloIdx: idx, fecha: new Date().toISOString() };
  setHistorial(hist);

  detenerTTS();
  renderizarComentarios(idx);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('btnVolverCapitulos').onclick = () => { detenerTTS(); abrirLector(historiaActual.id); };
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
};
document.getElementById('btnSalirPantallaCompleta').onclick = () => {
  document.body.classList.remove('modo-pantalla-completa');
  document.getElementById('btnSalirPantallaCompleta').style.display = 'none';
};

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
  document.getElementById('perfilNombre').value = perfilActual.username || 'Anónimo';
  document.getElementById('perfilBio').value = perfilActual.bio || '';
  document.getElementById('perfilEmoji').value = perfilActual.emoji || '👤';
  const av = document.getElementById('perfilAvatar');
  if (perfilActual.avatar_url) {
    av.innerHTML = `<img src="${perfilActual.avatar_url}">`;
    document.getElementById('btnQuitarFoto').style.display = 'inline-block';
  } else {
    av.textContent = perfilActual.emoji || '👤';
    document.getElementById('btnQuitarFoto').style.display = 'none';
  }
  fotoPerfilTemp = null;

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
  const username = document.getElementById('perfilNombre').value.trim() || 'Anónimo';
  const bio = document.getElementById('perfilBio').value.trim();
  const emoji = document.getElementById('perfilEmoji').value.trim() || '👤';

  perfilActual = { ...perfilActual, username, bio, emoji, avatar_url: fotoPerfilTemp || perfilActual.avatar_url || null };

  try {
    const clave = 'aren_perfil_' + usuarioActual.id;
    localStorage.setItem(clave, JSON.stringify(perfilActual));

    for (const h of _historiasCache) {
      if (h.user_id === usuarioActual.id) {
        await actualizarHistoriaSupabase({ ...h, autor: username, autorFoto: perfilActual.avatar_url });
      }
    }

    toast('Perfil guardado', 'success');
    actualizarAvatarCabecera();
    await recargarHistorias();

    const drawerUser = document.getElementById('drawerUsuario');
    if (drawerUser) {
      drawerUser.innerHTML = `
        <span class="nombre-drawer">${escapeHtml(perfilActual.username)}</span>
        ${escapeHtml(usuarioActual.email || '')}
      `;
    }
  } catch (err) { mostrarErrorCompleto(err, 'Error al guardar perfil'); }
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
    if (a.color === 'naranja' && colorBtn === 'predeterminado') b.classList.add('seleccionado');
    else if (a.color !== 'naranja' && colorBtn === a.color) b.classList.add('seleccionado');
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
  sin.title = 'Predeterminado (naranja)';
  sin.dataset.color = 'predeterminado';
  sin.textContent = 'A';
  sin.style.color = '#ff6b35';
  sin.style.fontWeight = '800';
  sin.onclick = () => { const a = getAjustes(); a.color = 'naranja'; setAjustes(a); aplicarTemaYColor(); };
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
      _historiasCache = [];
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