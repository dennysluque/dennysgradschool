import { workflow, node, trigger, sticky, languageModel, expr } from '@n8n/workflow-sdk';

const CHAT_ID = '8539877082';
const TABLA_PROMOS = '5OC4q6t41qSGkfBz';

const disparador = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Diario 8am y domingo 6pm',
    parameters: {
      rule: {
        interval: [
          { field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 5 },
          { field: 'weeks', weeksInterval: 1, triggerAtDay: [0], triggerAtHour: 18, triggerAtMinute: 0 }
        ]
      }
    }
  },
  output: [{ timestamp: '2026-09-14T08:05:00-05:00' }]
});

const definirModo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Definir modo',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
// Un solo flujo, tres modos:
//  diario -> 8am todos los dias: solo avisa si hay promos nuevas o si hoy es dia de promo.
//  semana -> domingo 6pm: plan de compras de la semana con todas las promos vigentes.
//  mes    -> dia 1 a las 8am: recordatorio de inscripciones y promos que se renuevan.
const ahora = $now.setZone('America/Lima');
const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
let modo = 'diario';
if (ahora.hour >= 12) modo = 'semana';
else if (ahora.day === 1) modo = 'mes';
return [{ json: {
  modo: modo,
  hoy: ahora.toFormat('yyyy-MM-dd'),
  hoy_dia_semana: ahora.weekday,
  hoy_nombre: DIAS[ahora.weekday],
  mes_nombre: MESES[ahora.month] + ' ' + ahora.year,
  fin_de_mes: ahora.endOf('month').toFormat('yyyy-MM-dd')
} }];
`
    }
  },
  output: [{ modo: 'diario', hoy: '2026-09-14', hoy_dia_semana: 1, hoy_nombre: 'lunes', mes_nombre: 'septiembre 2026', fin_de_mes: '2026-09-30' }]
});

const listarFuentes = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Listar fuentes',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
// Paginas oficiales que se leen en cada corrida. Si una cae o cambia, el flujo sigue:
// la busqueda web del modelo y los correos del banco cubren el hueco.
const FUENTES = [
  { banco: 'Interbank', etiqueta: 'Interbank - Cashback supermercados (inscripcion)', url: 'https://interbank.pe/promociones/inscripcion/cashback-supermercados' },
  { banco: 'Interbank', etiqueta: 'Interbank - Beneficios Amex', url: 'https://interbank.pe/promociones/descuentos/beneficios-amex' },
  { banco: 'Interbank', etiqueta: 'Interbank - Catalogo de promociones Lima', url: 'https://interbank.pe/promociones-catalogo/todo/todos/lima' },
  { banco: 'Interbank', etiqueta: 'Interbank - Supermercados Cuenta Sueldo', url: 'https://interbank.pe/beneficio-supermercados-cuenta-sueldo' },
  { banco: 'BCP', etiqueta: 'BCP - Beneficios con tarjetas', url: 'https://www.viabcp.com/beneficios/tarjetas' },
  { banco: 'BCP', etiqueta: 'BCP - Ofertas Wong', url: 'https://www.viabcp.com/beneficios/tarjetas/ofertas-wong' },
  { banco: 'BCP', etiqueta: 'BCP - Campana devolucion supermercados', url: 'https://www.viabcp.com/campana-beneficio-sorteo' },
  { banco: 'BCP', etiqueta: 'BCP - Mis beneficios tarjeta de credito', url: 'https://www.viabcp.com/beneficiostarjetabcp' },
  { banco: 'Financiera Oh', etiqueta: 'Tarjeta Oh - Supermercado (plazaVea/Vivanda)', url: 'https://www.plazavea.com.pe/tarjeta-oh' },
  { banco: 'Financiera Oh', etiqueta: 'Tarjeta Oh - Promociones', url: 'https://www.tarjetaoh.pe/promociones' },
  { banco: 'Tienda', etiqueta: 'Vivanda - Portada', url: 'https://www.vivanda.com.pe/' },
  { banco: 'Tienda', etiqueta: 'Wong - Portada', url: 'https://www.wong.pe/' },
  { banco: 'Tienda', etiqueta: 'Flora & Fauna - Portada', url: 'https://www.florayfauna.pe/' }
];
return FUENTES.map(function (f) { return { json: f }; });
`
    }
  },
  output: [{ banco: 'Interbank', etiqueta: 'Interbank - Cashback supermercados (inscripcion)', url: 'https://interbank.pe/promociones/inscripcion/cashback-supermercados' }]
});

const traerPaginas = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Traer paginas',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url }}'),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'User-Agent', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
          { name: 'Accept', value: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
          { name: 'Accept-Language', value: 'es-PE,es;q=0.9,en;q=0.8' }
        ]
      },
      options: {
        timeout: 30000,
        batching: { batch: { batchSize: 3, batchInterval: 1500 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'html', neverError: true, fullResponse: true } }
      }
    }
  },
  output: [{ statusCode: 200, body: '<html>...</html>', headers: {} }]
});

const listarFuentesLector = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Listar fuentes (lector)',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
// Interbank y BCP bloquean las lecturas directas (HTTP 403). Segundo intento con el
// lector publico r.jina.ai, que renderiza la pagina y devuelve texto plano.
return $('Listar fuentes').all().map(function (it) {
  return { json: { etiqueta: it.json.etiqueta, url_lector: 'https://r.jina.ai/' + it.json.url } };
});
`
    }
  },
  output: [{ etiqueta: 'Interbank - Beneficios Amex', url_lector: 'https://r.jina.ai/https://interbank.pe/promociones/descuentos/beneficios-amex' }]
});

const traerPaginasLector = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Traer paginas (lector)',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: expr('{{ $json.url_lector }}'),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: {
        parameters: [
          { name: 'Accept', value: 'text/plain' },
          { name: 'X-Return-Format', value: 'text' },
          { name: 'X-Timeout', value: '25' }
        ]
      },
      options: {
        timeout: 45000,
        batching: { batch: { batchSize: 2, batchInterval: 4000 } },
        response: { response: { responseFormat: 'text', outputPropertyName: 'html', neverError: true, fullResponse: true } }
      }
    }
  },
  output: [{ statusCode: 200, body: 'Title: ... Markdown Content: ...', headers: {} }]
});

const correosDennys = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Correos de Dennys',
    executeOnce: true,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation: 'getAll',
      returnAll: false,
      limit: 12,
      simple: false,
      filters: {
        q: 'newer_than:12d from:(interbank OR viabcp OR bcp OR tarjetaoh OR "financiera oh" OR wong OR vivanda OR florayfauna) subject:(promo OR promoción OR promociones OR cashback OR devolución OR descuento OR beneficio OR beneficios OR supermercado OR Wong OR Vivanda OR Flora OR inscríbete OR inscripción) -subject:(consumo OR constancia OR transferencia OR "estado de cuenta" OR "pago realizado" OR contraseña OR clave)',
        readStatus: 'both'
      },
      options: {}
    },
    credentials: { gmailOAuth2: { id: 'cSuPK6acKEhVT64N', name: 'Dennys' } }
  },
  output: [{ subject: 'Cashback en supermercados', from: 'Interbank <promociones@interbank.pe>', date: '2026-09-02', text: 'Inscríbete y compra los jueves...' }]
});

const correosAkemi = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Correos de Akemi',
    executeOnce: true,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation: 'getAll',
      returnAll: false,
      limit: 12,
      simple: false,
      filters: {
        q: 'newer_than:12d from:(interbank OR viabcp OR bcp OR tarjetaoh OR "financiera oh" OR wong OR vivanda OR florayfauna) subject:(promo OR promoción OR promociones OR cashback OR devolución OR descuento OR beneficio OR beneficios OR supermercado OR Wong OR Vivanda OR Flora OR inscríbete OR inscripción) -subject:(consumo OR constancia OR transferencia OR "estado de cuenta" OR "pago realizado" OR contraseña OR clave)',
        readStatus: 'both'
      },
      options: {}
    },
    credentials: { gmailOAuth2: { id: 'wXZFltelNG0uV5lb', name: 'Akemi' } }
  },
  output: [{ subject: 'Beneficios Amex', from: 'Interbank <promociones@interbank.pe>', date: '2026-09-03', text: '...' }]
});

const consolidarFuentes = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Consolidar fuentes',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const modo = $('Definir modo').first().json;
const fuentes = $('Listar fuentes').all();
const directas = $('Traer paginas').all();
let lector = [];
try { lector = $('Traer paginas (lector)').all(); } catch (e) { lector = []; }

function aTexto(html) {
  let s = String(html || '');
  s = s.replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
       .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
       .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, ' ')
       .replace(/<svg[\\s\\S]*?<\\/svg>/gi, ' ')
       .replace(/<!--[\\s\\S]*?-->/g, ' ')
       .replace(/<br\\s*\\/?>|<\\/p>|<\\/div>|<\\/li>|<\\/h[1-6]>|<\\/tr>/gi, '\\n')
       .replace(/<[^>]+>/g, ' ')
       .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
       .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
       .replace(/[ \\t\\r\\f\\v]+/g, ' ')
       .replace(/\\s*\\n\\s*/g, '\\n')
       .replace(/\\n{2,}/g, '\\n');
  return s.trim();
}

// Cada fuente tiene dos lecturas (directa y por el lector) en el mismo orden en que
// se listo. Se queda con la mas larga que haya respondido bien; si ninguna sirve,
// se anota como caida y el modelo la busca en la web.
const LIMITE = 7000;
const fuentesTexto = [];
const caidas = [];
for (let i = 0; i < fuentes.length; i++) {
  const f = fuentes[i].json;
  const candidatos = [];
  for (const lista of [directas, lector]) {
    const r = (lista[i] && lista[i].json) || {};
    const status = Number(r.statusCode || (r.error ? 0 : 200));
    const cuerpo = r.body != null ? r.body : (r.html != null ? r.html : (r.data != null ? r.data : ''));
    candidatos.push({ status: status, texto: aTexto(cuerpo) });
  }
  let mejor = null;
  for (const c of candidatos) {
    if (c.status >= 400 || c.status === 0 || c.texto.length < 200) continue;
    if (!mejor || c.texto.length > mejor.texto.length) mejor = c;
  }
  if (!mejor) {
    caidas.push(f.etiqueta + ' (HTTP ' + candidatos.map(function (c) { return c.status || 'sin respuesta'; }).join('/') + ')');
    continue;
  }
  fuentesTexto.push({ banco: f.banco, etiqueta: f.etiqueta, url: f.url, texto: mejor.texto.slice(0, LIMITE) });
}

function correosDe(nombreNodo, dueno) {
  let items = [];
  try { items = $(nombreNodo).all(); } catch (e) { items = []; }
  const out = [];
  for (const it of items) {
    const j = it.json || {};
    const asunto = j.subject || (j.headers && j.headers.subject) || '';
    if (!asunto) continue;
    const de = j.from || (j.headers && j.headers.from) || '';
    const deTexto = typeof de === 'string' ? de : (de && (de.text || de.value && de.value[0] && de.value[0].address)) || '';
    const cuerpo = j.text || (j.html ? aTexto(j.html) : (j.snippet || ''));
    out.push({ buzon: dueno, de: String(deTexto), asunto: String(asunto), fecha: String(j.date || ''), texto: String(cuerpo).slice(0, 3500) });
  }
  return out;
}
const correos = correosDe('Correos de Dennys', 'Dennys').concat(correosDe('Correos de Akemi', 'Akemi'));

return [{ json: Object.assign({}, modo, { fuentes: fuentesTexto, correos: correos, caidas: caidas }) }];
`
    }
  },
  output: [{ modo: 'diario', hoy: '2026-09-14', hoy_dia_semana: 1, hoy_nombre: 'lunes', mes_nombre: 'septiembre 2026', fin_de_mes: '2026-09-30', fuentes: [{ banco: 'Interbank', etiqueta: 'Interbank - Beneficios Amex', url: 'https://interbank.pe/promociones/descuentos/beneficios-amex', texto: '...' }], correos: [], caidas: [] }]
});

const promosConocidas = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Promos conocidas',
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, mode: 'id', value: TABLA_PROMOS },
      returnAll: true
    }
  },
  output: [{ id: 1, clave: 'interbank|wong|jueves|100-500|2026-09-30', banco: 'Interbank', tarjeta: 'Todas las tarjetas de crédito Interbank', tienda: 'Wong', titulo: 'Cashback supermercados', beneficio: 'S/100 de devolución por compras desde S/500', dias: 'jueves', vigencia_fin: '2026-09-30', requisitos: 'Compra mínima S/350', inscripcion: 'Sí', canal: 'ambos', url: 'https://interbank.pe/promociones/inscripcion/cashback-supermercados', primera_vez: '2026-09-01', ultima_vez: '2026-09-13', avisada: true }]
});

const prepararPrompt = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Preparar prompt',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const ctx = $('Consolidar fuentes').first().json;
const NL = String.fromCharCode(10);

// Promos ya registradas y todavia vigentes: se le pasan al modelo para que
// reutilice la misma clave y no las reporte como nuevas cada dia.
const conocidas = [];
for (const it of $input.all()) {
  const r = it.json || {};
  if (!r.clave) continue;
  if (r.vigencia_fin && r.vigencia_fin < ctx.hoy) continue;
  conocidas.push({ clave: r.clave, banco: r.banco, tarjeta: r.tarjeta, tienda: r.tienda, titulo: r.titulo, beneficio: r.beneficio, dias: r.dias, vigencia_fin: r.vigencia_fin || null, inscripcion: r.inscripcion });
}

let p = '';
p += 'FECHA DE HOY: ' + ctx.hoy + ' (' + ctx.hoy_nombre + '). MES EN CURSO: ' + ctx.mes_nombre + '.' + NL + NL;
p += 'TAREA: Encuentra TODAS las promociones de supermercado vigentes hoy o durante el mes en curso para nuestras tarjetas en Wong, Vivanda y Flora & Fauna (tienda física y compra online). ';
p += 'Usa tu búsqueda web para confirmar vigencia y condiciones actuales en interbank.pe, viabcp.com, tarjetaoh.pe, plazavea.com.pe, vivanda.com.pe, wong.pe y florayfauna.pe, y combina eso con las fuentes de abajo.' + NL + NL;

p += '=== PROMOS YA REGISTRADAS (si encuentras la misma promo, devuelve su clave en clave_existente) ===' + NL;
p += conocidas.length ? JSON.stringify(conocidas, null, 1) : '(ninguna todavía)';
p += NL + NL;

p += '=== CORREOS RECIENTES DE LOS BANCOS (' + ctx.correos.length + ') ===' + NL;
if (!ctx.correos.length) p += '(ninguno en los últimos días)' + NL;
for (const c of ctx.correos) {
  p += '--- Correo [' + c.buzon + '] de: ' + c.de + ' | asunto: ' + c.asunto + ' | fecha: ' + c.fecha + NL + c.texto + NL;
}
p += NL + '=== PÁGINAS OFICIALES LEÍDAS HOY (' + ctx.fuentes.length + ') ===' + NL;
for (const f of ctx.fuentes) {
  p += '--- Fuente: ' + f.etiqueta + ' | ' + f.url + NL + f.texto + NL;
}
if (ctx.caidas.length) p += NL + 'Páginas que no se pudieron leer hoy (búscalas en la web): ' + ctx.caidas.join('; ') + NL;

p += NL + 'Devuelve únicamente el JSON pedido.';

return [{ json: { prompt: p, conocidas: conocidas } }];
`
    }
  },
  output: [{ prompt: 'FECHA DE HOY: ...', conocidas: [] }]
});

const modeloBusqueda = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
  version: 1,
  config: {
    name: 'OpenRouter (Claude Sonnet + búsqueda web)',
    parameters: {
      model: 'anthropic/claude-sonnet-4.6:online',
      options: { temperature: 0.1, maxTokens: 6000, timeout: 240000, maxRetries: 2 }
    },
    credentials: { openRouterApi: { id: 'kZtKUT8bTQNwvkdb', name: 'OpenRouter account' } }
  }
});

const SYSTEM_PROMPT =
  'Eres el cazador de promociones de supermercado de Dennys y Akemi, una pareja que vive en Lima, Perú. Respondes siempre en español peruano, con precisión y sin inventar.\n' +
  '\n' +
  'NUESTRAS TARJETAS (solo estas cuentan):\n' +
  '1) BCP Visa Infinite Sapphire LATAM Pass. Aplican promos que digan "Visa BCP", "tarjetas de crédito BCP", "Visa Infinite BCP" o "Sapphire". NO aplican promos exclusivas de American Express BCP ni de débito BCP.\n' +
  '2) Interbank American Express (tarjeta de crédito). Aplican promos que digan "Amex Interbank", "American Express Interbank" o "tarjetas de crédito Interbank" en general. NO aplican promos exclusivas de Visa Interbank, Mastercard Interbank, Cuenta Sueldo o débito, salvo que el texto diga que aplica a todas las tarjetas de crédito. Si una promo depende de Cuenta Sueldo Interbank, inclúyela pero dilo claro en requisitos.\n' +
  '3) Tarjeta SIP de Financiera Oh! (grupo Intercorp). Es la versión actualizada de la Tarjeta Oh!, así que las promos publicadas como "Tarjeta Oh!", "oh!" o "SIP" aplican. Es aceptada en Vivanda y plazaVea (ambas de Supermercados Peruanos, Intercorp). Sus descuentos de "supermercado" suelen aplicar en plazaVea y Vivanda: inclúyelos y en tienda pon "Vivanda" si el texto lo confirma o "Vivanda (confirmar)" si solo menciona plazaVea. En los textos llámala "Tarjeta SIP (antes Oh!)".\n' +
  'No asumas a nombre de quién está cada tarjeta ni inventes datos personales: describe la tarjeta, no a la persona.\n' +
  '\n' +
  'TIENDAS QUE NOS INTERESAN: Wong y Vivanda (las tenemos cerca de casa) y Flora & Fauna. Compramos online en wong.pe, vivanda.com.pe y florayfauna.pe solo productos envasados o sellados; los frescos (pollo, carnes, frutas, verduras, pan) siempre en tienda física.\n' +
  'CÓMO COMPRAMOS: la compra grande de la semana es en persona los VIERNES. Solo cambiaríamos de día si una promo lo justifica. En Vivanda ya aplicamos siempre tres descuentos: descuento de colaborador Intercorp, cupón y Tarjeta SIP; por eso en Vivanda interesan sobre todo las promos ADICIONALES a eso y saber si son acumulables.\n' +
  '\n' +
  'REGLAS:\n' +
  '- Incluye una promo solo si aplica a alguna de nuestras tarjetas y a Wong, Vivanda o Flora & Fauna (o a "supermercados" en general incluyendo alguna de ellas).\n' +
  '- VIGENCIA: incluye una promo solo si tienes evidencia de que está vigente hoy o durante el mes en curso: fechas del mes actual en el texto, un correo reciente del banco, o un beneficio permanente (ej. Precios Oh!). Si lo único que encuentras son términos y condiciones de un mes o un año anterior, NO la pongas en promos; menciónala brevemente en notas como "posible renovación, sin confirmar".\n' +
  '- Ignora promos de otros bancos (BBVA, Scotiabank, Diners, Ripley, Falabella, Cencosud, etc.) y de otras tiendas (Metro, Tottus, plazaVea sola, Makro) salvo que la misma promo incluya Wong o Vivanda.\n' +
  '- Ignora promos que no sean de compras de supermercado (restaurantes, viajes, electro, moda).\n' +
  '- Los correos de notificación de consumos, constancias de pago o transferencias NO son promociones: ignóralos.\n' +
  '- Ignora promos vencidas. Si la vigencia no está clara, pon vigencia_fin null y confianza "media" o "baja".\n' +
  '- Muchas promos de Interbank y BCP exigen INSCRIPCIÓN previa (registrarse en un enlace o en la app). Detéctalo siempre y pon el enlace si existe.\n' +
  '- Si la promo aparece en una promo ya registrada (lista que te doy), copia su clave en clave_existente; si es nueva, deja clave_existente en null.\n' +
  '- No repitas la misma promo dos veces. Si hay dos niveles de un mismo beneficio (ej. S/50 desde S/350 y S/100 desde S/500), es UNA sola promo con ambos niveles en beneficio.\n' +
  '- Prefiere la información de los correos y páginas oficiales de hoy sobre lo que recuerdes de tu entrenamiento.\n' +
  '- En "dias" escribe solo el día o días (ej. "jueves", "lunes y miércoles", "todos los días"); las aclaraciones van en requisitos o notas.\n' +
  '- "importante": true solo si la promo justificaría mover la compra semanal del viernes a otro día: descuento de 10% o más, o devolución de S/30 o más en una compra típica de supermercado. Los beneficios permanentes que ya usamos (Precios Oh!/SIP) no son importantes.\n' +
  '- "acumulable": si la promo se puede sumar al descuento de colaborador Intercorp y a cupones. Si los términos dicen "no acumulable con otras promociones o descuentos", pon "no"; si lo permiten explícitamente, "sí"; si no lo mencionan, "no dice".\n' +
  '\n' +
  'FORMATO DE SALIDA: responde SOLO con un bloque JSON (sin texto antes ni después) con esta forma exacta:\n' +
  '{"promos":[{"clave_existente":null,"banco":"Interbank|BCP|Financiera Oh","tarjeta":"texto corto de qué tarjeta aplica","tienda":"Wong|Vivanda|Flora & Fauna|Wong y Vivanda|Supermercados varios","titulo":"nombre corto","beneficio":"qué te dan, con montos","dias":"jueves|lunes y miércoles|todos los días|...","dias_semana":[4],"vigencia_inicio":"YYYY-MM-DD o null","vigencia_fin":"YYYY-MM-DD o null","requisitos":"monto mínimo, categorías, topes, exclusiones","inscripcion":"No|Sí: cómo y dónde (enlace)","canal":"tienda|online|ambos","aplica_frescos":true,"url":"enlace oficial","confianza":"alta|media|baja","fuente":"correo|pagina|busqueda","importante":false,"acumulable":"sí|no|no dice"}],"notas":"observaciones breves (promos dudosas, posibles renovaciones sin confirmar, avisos de fin de mes)"}\n' +
  'dias_semana usa 1=lunes ... 7=domingo; lista vacía [] si aplica todos los días.\n';

const buscarPromos = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Buscar y extraer promos',
    executeOnce: true,
    parameters: {
      promptType: 'define',
      text: expr('{{ $json.prompt }}'),
      messages: {
        messageValues: [
          { type: 'SystemMessagePromptTemplate', message: SYSTEM_PROMPT }
        ]
      },
      batching: { batchSize: 1, delayBetweenBatches: 0 }
    },
    subnodes: { model: modeloBusqueda }
  },
  output: [{ text: '{"promos":[],"notas":""}' }]
});

const procesarRespuesta = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Procesar respuesta',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const ctx = $('Consolidar fuentes').first().json;
const conocidas = $('Preparar prompt').first().json.conocidas || [];
const crudo = String(($input.first().json || {}).text || ($input.first().json || {}).output || '');

// El modelo debe devolver JSON, pero a veces lo envuelve en un bloque de codigo
// o agrega una frase. Se rescata el primer objeto JSON balanceado.
function extraerJson(s) {
  const fence = s.match(/\\x60\\x60\\x60(?:json)?\\s*([\\s\\S]*?)\\x60\\x60\\x60/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const ini = s.indexOf('{');
  if (ini < 0) return null;
  let prof = 0;
  for (let i = ini; i < s.length; i++) {
    if (s[i] === '{') prof++;
    else if (s[i] === '}') { prof--; if (prof === 0) { try { return JSON.parse(s.slice(ini, i + 1)); } catch (e) { return null; } } }
  }
  return null;
}

const data = extraerJson(crudo) || { promos: [], notas: 'No se pudo interpretar la respuesta del modelo.' };
const lista = Array.isArray(data.promos) ? data.promos : [];

function norm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function slug(s) { return norm(s).replace(/\\s+/g, '-'); }
// La clave identifica una promo entre corridas: banco, tienda, dias de la semana,
// los montos que aparecen en el beneficio y la fecha de fin. Nada de texto libre,
// para que una redaccion distinta del modelo no la convierta en "nueva".
function claveDe(p, dias) {
  const nums = (String(p.beneficio || '') + ' ' + String(p.requisitos || '')).match(/\\d+(?:[.,]\\d+)?/g) || [];
  const unicos = [];
  for (const n of nums) { const v = n.replace(',', '.'); if (unicos.indexOf(v) < 0) unicos.push(v); }
  const numsOrd = unicos.sort().slice(0, 6).join('-');
  const diasTxt = dias.length ? dias.slice().sort().join('') : 'todos';
  return [slug(p.banco), slug(p.tienda), diasTxt, numsOrd, p.vigencia_fin || 'sin-fin'].join('|');
}

const clavesConocidas = new Set(conocidas.map(function (c) { return c.clave; }));
const vistas = new Set();
const promos = [];
for (const p of lista) {
  if (!p || !p.banco || !p.beneficio) continue;
  const tiendaN = norm(p.tienda);
  if (!/wong|vivanda|flora|supermercado/.test(tiendaN)) continue;
  if (p.vigencia_fin && p.vigencia_fin < ctx.hoy) continue;
  const dias = Array.isArray(p.dias_semana) ? p.dias_semana.map(Number).filter(function (d) { return d >= 1 && d <= 7; }) : [];
  const clave = (p.clave_existente && clavesConocidas.has(p.clave_existente)) ? p.clave_existente : claveDe(p, dias);
  if (vistas.has(clave)) continue;
  vistas.add(clave);
  promos.push({
    clave: clave,
    banco: String(p.banco || ''),
    tarjeta: String(p.tarjeta || ''),
    tienda: String(p.tienda || ''),
    titulo: String(p.titulo || p.beneficio || '').slice(0, 120),
    beneficio: String(p.beneficio || ''),
    dias: String(p.dias || (dias.length ? '' : 'todos los días')),
    dias_semana: dias,
    vigencia_inicio: p.vigencia_inicio || null,
    vigencia_fin: p.vigencia_fin || null,
    requisitos: String(p.requisitos || ''),
    inscripcion: String(p.inscripcion || 'No'),
    canal: String(p.canal || 'ambos'),
    aplica_frescos: p.aplica_frescos !== false,
    url: String(p.url || ''),
    confianza: String(p.confianza || 'media'),
    fuente: String(p.fuente || ''),
    importante: p.importante === true,
    acumulable: String(p.acumulable || 'no dice'),
    es_nueva: !clavesConocidas.has(clave)
  });
}

return [{ json: {
  modo: ctx.modo,
  hoy: ctx.hoy,
  hoy_dia_semana: ctx.hoy_dia_semana,
  hoy_nombre: ctx.hoy_nombre,
  mes_nombre: ctx.mes_nombre,
  fin_de_mes: ctx.fin_de_mes,
  caidas: ctx.caidas,
  notas: String(data.notas || ''),
  promos: promos,
  nuevas: promos.filter(function (p) { return p.es_nueva; }),
  interpretado: !!extraerJson(crudo)
} }];
`
    }
  },
  output: [{ modo: 'diario', hoy: '2026-09-14', hoy_dia_semana: 1, hoy_nombre: 'lunes', mes_nombre: 'septiembre 2026', fin_de_mes: '2026-09-30', caidas: [], notas: '', promos: [{ clave: 'interbank|wong|jueves|100-350-50-500|2026-09-30', banco: 'Interbank', tarjeta: 'Todas las tarjetas de crédito Interbank', tienda: 'Wong', titulo: 'Cashback supermercados', beneficio: 'S/50 desde S/350 y S/100 desde S/500', dias: 'jueves', dias_semana: [4], vigencia_inicio: '2026-09-01', vigencia_fin: '2026-09-30', requisitos: 'Compra mínima S/350', inscripcion: 'Sí: enlace del correo', canal: 'ambos', aplica_frescos: true, url: 'https://interbank.pe/promociones/inscripcion/cashback-supermercados', confianza: 'alta', fuente: 'pagina', es_nueva: true }], nuevas: [], interpretado: true }]
});

const armarMensaje = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Armar mensaje',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const d = $input.first().json;
const NL = String.fromCharCode(10);
const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
// Dia habitual de la compra grande en persona (1=lunes ... 7=domingo).
const DIA_COMPRAS = 5;
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fechaCorta(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (!m) return String(iso);
  const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
  return Number(m[3]) + ' ' + MES[Number(m[2])];
}
function icono(tienda) {
  const t = String(tienda).toLowerCase();
  if (t.indexOf('flora') >= 0) return '🌿';
  if (t.indexOf('vivanda') >= 0) return '🍋';
  if (t.indexOf('wong') >= 0) return '🛒';
  return '🏬';
}
function esVivanda(p) { return String(p.tienda).toLowerCase().indexOf('vivanda') >= 0; }
function requiereInscripcion(p) { return /^s[ií]/i.test(String(p.inscripcion || '')); }
function textoInscripcion(p) { return esc(String(p.inscripcion || '').replace(/^s[ií]\\s*[:.-]?\\s*/i, '')); }
function canalTexto(p) {
  if (p.canal === 'online') return 'solo online (envasados)';
  if (p.canal === 'tienda') return 'solo en tienda';
  return 'tienda y online';
}
function aplicaDia(p, dia) { return !p.dias_semana.length || p.dias_semana.indexOf(dia) >= 0; }
function resumen(p) { return esc(p.tienda) + ' con ' + esc(p.tarjeta) + ' (' + esc(p.beneficio) + ')' + (p.importante ? ' ⭐' : ''); }
function fichaPromo(p, detallada) {
  let s = icono(p.tienda) + ' <b>' + esc(p.tienda) + '</b> · ' + esc(p.tarjeta) + (p.importante ? ' ⭐' : '') + NL;
  s += '   💸 ' + esc(p.beneficio) + NL;
  s += '   📅 ' + esc(p.dias || 'todos los días');
  if (p.vigencia_fin) s += ' · hasta el ' + fechaCorta(p.vigencia_fin);
  s += NL;
  if (detallada && p.requisitos) s += '   📋 ' + esc(p.requisitos) + NL;
  if (requiereInscripcion(p)) s += '   ⚠️ <b>Requiere inscripción:</b> ' + textoInscripcion(p) + NL;
  if (detallada && esVivanda(p)) s += '   🧾 Acumulable con colaborador Intercorp y cupón: ' + esc(p.acumulable || 'no dice') + NL;
  if (detallada) s += '   🛍 ' + canalTexto(p) + (p.aplica_frescos ? '' : ' · no aplica a frescos') + NL;
  if (p.confianza === 'baja') s += '   ❓ confianza baja, verificar antes de ir' + NL;
  if (p.url) s += '   🔗 ' + esc(p.url) + NL;
  return s;
}

const promos = d.promos || [];
const nuevas = d.nuevas || [];
const bloques = [];
// Las notas del modelo son utiles pero pueden ser largas: en el aviso diario se recortan.
const notasLargas = String(d.notas || '');
const notas = d.modo === 'diario' && notasLargas.length > 900 ? notasLargas.slice(0, 900) + '…' : notasLargas;

if (d.modo === 'semana') {
  let m = '<b>🛒 Plan de compras de la semana</b>' + NL;
  m += 'Promos vigentes para Wong, Vivanda y Flora &amp; Fauna con tus tarjetas (BCP Sapphire, Amex Interbank, Tarjeta SIP).' + NL + NL;
  if (!promos.length) {
    m += 'No encontré ninguna promo bancaria vigente esta semana. Compra el viernes como siempre; en Vivanda sigue aplicando colaborador + cupón + SIP.' + NL;
  } else {
    // 1) Lo que aplica el dia habitual de compras.
    const delViernes = promos.filter(function (p) { return aplicaDia(p, DIA_COMPRAS); });
    m += '<b>🗓 ' + cap(DIAS[DIA_COMPRAS]) + ' (tu día de compras)</b>' + NL;
    if (delViernes.length) m += delViernes.map(function (p) { return '• ' + resumen(p); }).join(NL) + NL;
    else m += 'Sin promos bancarias extra ese día. En Vivanda aplica lo de siempre: colaborador + cupón + SIP.' + NL;

    // 2) Promos de otros dias: solo vale la pena moverse si el modelo las marco como importantes.
    const otrosDias = promos.filter(function (p) { return p.dias_semana.length && p.dias_semana.indexOf(DIA_COMPRAS) < 0; });
    m += NL + '<b>🔁 ¿Conviene cambiar de día?</b>' + NL;
    const importantes = otrosDias.filter(function (p) { return p.importante; });
    if (importantes.length) {
      m += 'Sí, esta semana vale la pena moverse:' + NL;
      m += importantes.map(function (p) { return '• <b>' + esc(cap(p.dias)) + ':</b> ' + resumen(p); }).join(NL) + NL;
    } else {
      m += 'No hace falta: nada de otro día supera lo del ' + DIAS[DIA_COMPRAS] + '.' + NL;
    }
    const menores = otrosDias.filter(function (p) { return !p.importante; });
    if (menores.length) m += 'Otras promos de otros días (menores): ' + menores.map(function (p) { return esc(p.dias) + ' · ' + esc(p.tienda) + ' · ' + esc(p.beneficio); }).join('; ') + NL;

    // 3) Detalle por tipo de compra.
    m += NL + '<b>🥦 Frescos (ir a la tienda)</b>' + NL;
    const frescos = promos.filter(function (p) { return p.aplica_frescos && p.canal !== 'online'; });
    m += frescos.length ? frescos.map(function (p) { return fichaPromo(p, true); }).join(NL) : 'Ninguna promo bancaria aplica a frescos en tienda esta semana.' + NL;
    m += NL + '<b>📦 Envasados (se puede pedir online)</b>' + NL;
    const online = promos.filter(function (p) { return p.canal !== 'tienda'; });
    m += online.length ? online.map(function (p) { return '• ' + esc(p.tienda) + ' · ' + esc(p.tarjeta) + ' · ' + esc(p.beneficio) + (p.dias_semana.length ? ' (' + esc(p.dias) + ')' : ''); }).join(NL) + NL : 'Ninguna promo válida para compra online esta semana.' + NL;
    const inscr = promos.filter(requiereInscripcion);
    if (inscr.length) {
      m += NL + '<b>⚠️ Antes de comprar, inscríbete en:</b>' + NL;
      m += inscr.map(function (p) { return '• ' + esc(p.tienda) + ' · ' + esc(p.tarjeta) + ': ' + textoInscripcion(p) + (p.url ? ' ' + esc(p.url) : ''); }).join(NL) + NL;
    }
  }
  if (notas) m += NL + '<i>' + esc(notas) + '</i>' + NL;
  if (d.caidas && d.caidas.length) m += NL + '<i>Páginas que no pude leer hoy: ' + esc(d.caidas.join(', ')) + '. Me apoyé en búsqueda web y correos.</i>';
  bloques.push(m);
}

if (d.modo === 'mes') {
  let m = '<b>📆 Inicio de mes: promos de supermercado de ' + esc(d.mes_nombre) + '</b>' + NL + NL;
  if (!promos.length) {
    m += 'Todavía no aparecen promos publicadas para este mes. Interbank y BCP suelen publicarlas en los primeros días; te aviso apenas salgan.' + NL;
  } else {
    m += promos.map(function (p) { return fichaPromo(p, true); }).join(NL);
    const inscr = promos.filter(requiereInscripcion);
    if (inscr.length) m += NL + '⚠️ <b>' + inscr.length + (inscr.length === 1 ? ' promo requiere' : ' promos requieren') + ' inscripción este mes.</b> Hazlo hoy para no perderlas.' + NL;
  }
  m += NL + '<i>Tip: revisa también la sección Promociones de la app de Interbank y "Mis beneficios" en la app BCP; a veces la inscripción solo aparece ahí.</i>';
  if (notas) m += NL + '<i>' + esc(notas) + '</i>';
  bloques.push(m);
}

if (d.modo === 'diario') {
  if (nuevas.length) {
    let m = '<b>🆕 ' + (nuevas.length === 1 ? 'Nueva promo de supermercado' : nuevas.length + ' nuevas promos de supermercado') + '</b>' + NL + NL;
    m += nuevas.map(function (p) { return fichaPromo(p, true); }).join(NL);
    const importantesOtroDia = nuevas.filter(function (p) { return p.importante && p.dias_semana.length && p.dias_semana.indexOf(DIA_COMPRAS) < 0; });
    if (importantesOtroDia.length) m += NL + '⭐ <b>Ojo:</b> ' + (importantesOtroDia.length === 1 ? 'esta promo cae' : 'estas promos caen') + ' fuera del ' + DIAS[DIA_COMPRAS] + ' y podría valer la pena mover la compra: ' + importantesOtroDia.map(function (p) { return esc(p.dias); }).join(', ') + '.' + NL;
    if (notas) m += NL + '<i>' + esc(notas) + '</i>';
    bloques.push(m);
  }
  const hoyDia = Number(d.hoy_dia_semana);
  const hoy = promos.filter(function (p) { return p.dias_semana.length && p.dias_semana.indexOf(hoyDia) >= 0 && !p.es_nueva; });
  if (hoy.length) {
    let m = '<b>📅 Hoy ' + esc(d.hoy_nombre) + ' aplica:</b>' + NL + NL;
    m += hoy.map(function (p) { return fichaPromo(p, false); }).join(NL);
    bloques.push(m);
  }
  // La vispera del dia de compras: recordar que aplica manana, con lo permanente incluido.
  if (hoyDia === DIA_COMPRAS - 1) {
    const manana = promos.filter(function (p) { return aplicaDia(p, DIA_COMPRAS) && !p.es_nueva; });
    if (manana.length) {
      let m = '<b>🛒 Mañana ' + DIAS[DIA_COMPRAS] + ' es día de compras. Aplica:</b>' + NL + NL;
      m += manana.map(function (p) { return fichaPromo(p, false); }).join(NL);
      const pend = manana.filter(requiereInscripcion);
      if (pend.length) m += NL + '⚠️ Revisa que ya estés inscrito en: ' + pend.map(function (p) { return esc(p.tienda) + ' · ' + esc(p.tarjeta); }).join('; ') + '.';
      bloques.push(m);
    }
  }
}

if (!bloques.length) return [];

// Telegram corta en 4096 caracteres: se parte por parrafos.
const LIMITE = 3800;
const out = [];
for (const b of bloques) {
  if (b.length <= LIMITE) { out.push(b); continue; }
  let actual = '';
  for (const parte of b.split(NL + NL)) {
    if ((actual + NL + NL + parte).length > LIMITE && actual) { out.push(actual); actual = parte; }
    else actual = actual ? actual + NL + NL + parte : parte;
  }
  if (actual) out.push(actual);
}
return out.map(function (m) { return { json: { mensaje: m } }; });
`
    }
  },
  output: [{ mensaje: '<b>🆕 Nueva promo de supermercado</b>' }]
});

const avisarTelegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Avisar por Telegram (Robin)',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: CHAT_ID,
      text: expr('{{ $json.mensaje }}'),
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true }
    },
    credentials: { telegramApi: { id: 'qW8SrjcX8QfMYvE9', name: 'Robin' } }
  },
  output: [{ ok: true }]
});

const filasParaGuardar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Filas para guardar',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
const d = $input.first().json;
const out = [];
for (const p of d.promos || []) {
  out.push({ json: {
    clave: p.clave,
    banco: p.banco,
    tarjeta: p.tarjeta,
    tienda: p.tienda,
    titulo: p.titulo,
    beneficio: p.beneficio,
    dias: p.dias,
    vigencia_fin: p.vigencia_fin || '',
    requisitos: p.requisitos,
    inscripcion: p.inscripcion,
    canal: p.canal,
    url: p.url,
    primera_vez: p.es_nueva ? d.hoy : '',
    ultima_vez: d.hoy,
    avisada: true
  } });
}
return out;
`
    }
  },
  output: [{ clave: 'interbank|wong|jueves|100-350-50-500|2026-09-30', banco: 'Interbank', tarjeta: 'Todas las tarjetas de crédito Interbank', tienda: 'Wong', titulo: 'Cashback supermercados', beneficio: 'S/50 desde S/350 y S/100 desde S/500', dias: 'jueves', vigencia_fin: '2026-09-30', requisitos: 'Compra mínima S/350', inscripcion: 'Sí: enlace del correo', canal: 'ambos', url: 'https://interbank.pe/promociones/inscripcion/cashback-supermercados', primera_vez: '2026-09-14', ultima_vez: '2026-09-14', avisada: true }]
});


const guardarPromos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Guardar promos',
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: { __rl: true, mode: 'id', value: TABLA_PROMOS },
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'clave', condition: 'eq', keyValue: expr('{{ $json.clave }}') }] },
      columns: {
        mappingMode: 'autoMapInputData',
        value: null,
        matchingColumns: ['clave'],
        schema: [
          { id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'banco', displayName: 'banco', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'tarjeta', displayName: 'tarjeta', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'tienda', displayName: 'tienda', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'titulo', displayName: 'titulo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'beneficio', displayName: 'beneficio', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'dias', displayName: 'dias', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'vigencia_fin', displayName: 'vigencia_fin', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'requisitos', displayName: 'requisitos', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'inscripcion', displayName: 'inscripcion', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'canal', displayName: 'canal', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'url', displayName: 'url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'primera_vez', displayName: 'primera_vez', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'ultima_vez', displayName: 'ultima_vez', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true, removed: false },
          { id: 'avisada', displayName: 'avisada', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true, removed: false }
        ]
      }
    }
  },
  output: [{ id: 1 }]
});

const notaCabecera = sticky(
  '## 🛒 Cazador de promos de supermercado\n\n' +
  'Revisa cada día las promos de **Wong, Vivanda y Flora & Fauna** para las tarjetas **BCP Visa Sapphire**, **Interbank American Express** y **Tarjeta SIP (antes Oh!)**.\n\n' +
  '**Modos (los decide el nodo Definir modo):**\n' +
  '- **Diario 8:05am**: lee páginas oficiales + correos de bancos + búsqueda web. Solo escribe si hay promo nueva o si hoy es día de promo.\n' +
  '- **Domingo 6pm**: plan de compras de la semana centrado en el viernes (día habitual): qué aplica ese día, si vale la pena cambiar de día, frescos vs online.\n' +
  '- **Jueves 8:05am**: además avisa lo que aplica mañana viernes.\n- **Día 1, 8:05am**: promos del mes y recordatorio de inscripciones.\n\n' +
  'La memoria vive en la Data Table **Promos supermercado** (columna clave). Para forzar que vuelva a avisar todo, vacía la tabla.',
  [disparador, definirModo, listarFuentes],
  { color: 4 }
);

const notaFuentes = sticky(
  '### Fuentes\n' +
  '- **Listar fuentes**: URLs oficiales; agrega o quita líneas ahí.\n' +
  '- **Correos**: busca en Gmail (Dennys y Akemi) correos de Interbank/BCP/Oh!/tiendas de los últimos 12 días; ahí llega el enlace de inscripción.\n' +
  '- Interbank y BCP bloquean el HTTP directo (403): hay una segunda lectura vía r.jina.ai. Si ambas fallan, el modelo la busca en la web.',
  [traerPaginas, listarFuentesLector, traerPaginasLector, correosDennys, correosAkemi],
  { color: 5 }
);

export default workflow('cazador-promos-supermercado', 'Cazador de promos de supermercado')
  .add(notaCabecera)
  .add(notaFuentes)
  .add(disparador)
  .to(definirModo)
  .to(listarFuentes)
  .to(traerPaginas)
  .to(listarFuentesLector)
  .to(traerPaginasLector)
  .to(correosDennys)
  .to(correosAkemi)
  .to(consolidarFuentes)
  .to(promosConocidas)
  .to(prepararPrompt)
  .to(buscarPromos)
  .to(procesarRespuesta)
  .to(armarMensaje)
  .to(avisarTelegram)
  .add(procesarRespuesta)
  .to(filasParaGuardar)
  .to(guardarPromos);
