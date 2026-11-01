// Función de Vercel: redacta preguntas tipo test a partir de los apuntes con la API de Claude.
// Variables de entorno en Vercel: ANTHROPIC_API_KEY (clave de la API) y CLAVE_WEB (contraseña de la web).
// También acepta la clave de API propia de quien usa la web (campo apiKey): se usa solo para esa petición y no se guarda.
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';

const LET = 'ABCDEF';

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['preguntas'],
  properties: {
    preguntas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pregunta', 'opciones', 'correcta', 'nivel', 'apartado', 'explicacion', 'ordenFijo'],
        properties: {
          pregunta: { type: 'string' },
          opciones: { type: 'array', items: { type: 'string' } },
          correcta: { type: 'string', enum: LET.split('') },
          nivel: { type: 'string', enum: ['básico', 'medio', 'avanzado'] },
          apartado: { type: 'string' },
          explicacion: { type: 'string' },
          ordenFijo: { type: 'boolean' },
        },
      },
    },
  },
};

const SISTEMA = `Eres una profesora de Ciencias de secundaria y bachillerato en España que redacta exámenes tipo test para su alumnado.
Escribe en español de España, con un registro claro y correcto. Usa unidades del SI y notación científica correcta (coma decimal: 0,25; potencias como 3,2·10^-4).

Cómo escribir las fórmulas (el texto se convierte después a Word):
- Fórmulas químicas entre acentos graves: \`H2SO4\`, \`CH3COOH\`; los números que siguen a una letra o paréntesis salen en subíndice.
- Superíndices con ^: \`SO4^2-\`, \`Fe^3+\`, \`H^+\`, 10^-3, m^2. Subíndices sueltos con _: v_0, K_c.
- No uses LaTeX, Markdown ni etiquetas HTML.

Reglas de las preguntas:
- Basa cada pregunta solo en el contenido de los apuntes, respetando su nivel y su vocabulario.
- Una única respuesta correcta por pregunta, sin ambigüedad. Los distractores deben ser plausibles y salir de errores típicos del alumnado, con longitud y estilo parecidos a la correcta.
- No uses «todas las anteriores» ni «ninguna de las anteriores» salvo que se pida; si se usa, pon ordenFijo = true.
- Evita enunciados en negativo; si hace falta, escribe NO en mayúsculas.
- En las preguntas de cálculo, resuelve el problema paso a paso antes de escribir las opciones, comprueba el resultado y construye los distractores a partir de errores frecuentes (unidades, factor olvidado, estequiometría mal ajustada). Si las opciones son números, ordénalas de menor a mayor y pon ordenFijo = true.
- Reparte la posición de la respuesta correcta entre todas las letras de forma equilibrada.
- No repitas preguntas ni preguntes dos veces lo mismo con otras palabras. Reparte las preguntas por todos los apartados de los apuntes.
- «apartado»: el apartado o epígrafe de los apuntes al que pertenece (breve).
- «explicacion»: una o dos frases que justifiquen la respuesta correcta (con el cálculo resumido si lo hay).
- Nivel básico: recordar y reconocer. Medio: aplicar y relacionar. Avanzado: razonar, calcular en varios pasos o integrar conceptos.

Antes de terminar, repasa cada pregunta: comprueba que la letra de «correcta» señala de verdad la opción correcta y que ningún distractor también es correcto.`;

function mismaClave(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const b = req.body || {};
  const propia = String(b.apiKey || '').trim();
  let client;
  if (propia) {
    if (!/^sk-ant-[\w-]{20,}$/.test(propia)) return res.status(400).json({ error: 'La clave de API no tiene el formato de Anthropic (sk-ant-…).' });
    client = new Anthropic({ apiKey: propia });
  } else {
    if (!process.env.CLAVE_WEB || !process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Esta web no tiene clave de API configurada: escribe tu propia clave de API.' });
    }
    if (!mismaClave(b.clave, process.env.CLAVE_WEB)) return res.status(401).json({ error: 'Contraseña incorrecta.' });
    client = new Anthropic();
  }

  const apuntes = String(b.apuntes || '').slice(0, 600000);
  if (apuntes.trim().length < 200) return res.status(400).json({ error: 'Faltan los apuntes.' });
  const n = Math.min(60, Math.max(1, parseInt(b.n, 10) || 20));
  const nopt = Math.min(6, Math.max(2, parseInt(b.nopt, 10) || 4));
  const nivel = ['básico', 'medio', 'avanzado'].includes(b.nivel) ? `todas de nivel ${b.nivel}`
    : 'nivel mixto: aproximadamente un 30 % básico, un 50 % medio y un 20 % avanzado';

  const peticion = [
    `Materia: ${b.materia || 'Ciencias'}. Curso: ${b.curso || 'secundaria'}.${b.tema ? ` Tema: ${b.tema}.` : ''}`,
    `Redacta exactamente ${n} preguntas tipo test con exactamente ${nopt} opciones cada una (letras ${LET.slice(0, nopt).split('').join(', ')}), ${nivel}.`,
    b.indicaciones ? `Indicaciones de la profesora (tienen prioridad): ${String(b.indicaciones).slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
      system: SISTEMA,
      messages: [{
        role: 'user',
        content: `<apuntes>\n${apuntes}\n</apuntes>\n\n${peticion}`,
      }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'El modelo no ha querido generar estas preguntas. Prueba con otros apuntes o indicaciones.' });
    if (msg.stop_reason === 'max_tokens') return res.status(422).json({ error: 'La respuesta se cortó. Pide menos preguntas.' });
    const texto = msg.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const datos = JSON.parse(texto);
    const avisos = [];
    const preguntas = (datos.preguntas || []).map((q, i) => {
      const opciones = (q.opciones || []).map(o => String(o).trim()).filter(Boolean);
      let correcta = String(q.correcta || '').toUpperCase();
      if (LET.indexOf(correcta) < 0 || LET.indexOf(correcta) >= opciones.length) { correcta = ''; avisos.push(`la ${i + 1} sin respuesta válida`); }
      if (opciones.length !== nopt) avisos.push(`la ${i + 1} tiene ${opciones.length} opciones`);
      return { pregunta: String(q.pregunta || '').trim(), opciones, correcta, nivel: q.nivel || '', apartado: q.apartado || '', explicacion: q.explicacion || '', ordenFijo: !!q.ordenFijo, origen: 'nueva' };
    });
    const uso = msg.usage || {};
    return res.status(200).json({
      preguntas,
      aviso: `${preguntas.length} preguntas generadas${avisos.length ? ' (revisa: ' + avisos.join('; ') + ')' : ''}. Tokens: ${uso.input_tokens || 0} de entrada y ${uso.output_tokens || 0} de salida.`,
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(401).json({ error: propia ? 'Tu clave de API no es válida o está desactivada.' : 'La clave de la API guardada en Vercel no es válida.' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Demasiadas peticiones seguidas. Espera un minuto.' });
    if (e instanceof Anthropic.PermissionDeniedError || (e && e.status === 400 && /credit|balance/i.test(e.message || ''))) return res.status(402).json({ error: 'La cuenta de esa clave de API no tiene saldo o permiso. Revísalo en console.anthropic.com.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: 'Error de la API de Claude: ' + e.message });
    if (e instanceof SyntaxError) return res.status(502).json({ error: 'La respuesta no tenía el formato esperado. Vuelve a intentarlo.' });
    return res.status(500).json({ error: 'Error inesperado: ' + (e && e.message ? e.message : e) });
  }
}
