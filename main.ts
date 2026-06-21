// Servidor de previsualización de cortinas — Cortinería
// Recibe: foto del ambiente + datos de la cortina (tipo, color, medidas)
// Llama a la API de Google Gemini de forma segura (la clave nunca se expone al navegador)
// Devuelve: imagen generada con la cortina simulada en el ambiente

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const MODEL = "gemini-3.1-flash-image-preview";

// Dominios que tienen permiso de llamar a este servidor.
// "*" permite cualquier origen — útil para probar rápido, lo podemos restringir después.
const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Falta configurar GEMINI_API_KEY en el servidor" }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const {
      imagenAmbienteBase64,
      tipoTela,
      colorTela,
      anchoCm,
      altoCm,
    } = body;

    if (!imagenAmbienteBase64) {
      return new Response(JSON.stringify({ error: "Falta la foto del ambiente" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const prompt = `Editá esta foto de un ambiente agregando una cortina roller instalada en la ventana visible.
Especificaciones de la cortina:
- Tipo de tela: ${tipoTela}
- Color: ${colorTela}
- Medidas aproximadas: ${anchoCm} cm de ancho x ${altoCm} cm de alto
- La cortina debe verse instalada de forma realista, respetando la perspectiva, la luz y las sombras del ambiente original.
- ${tipoTela.toLowerCase().includes("screen") ? "Esta tela es translúcida (deja pasar algo de luz), debe verse semi-transparente." : "Esta tela es opaca (black out), debe bloquear completamente la luz y verse sólida."}
- No modifiques el resto del ambiente, solo agregá la cortina en la ventana.`;

    const geminiResponse = await fetch(
      https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: imagenAmbienteBase64,
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return new Response(
        JSON.stringify({ error: "Error al generar la imagen", detalle: errText }),
        { status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      );
    }

    const data = await geminiResponse.json();

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData || p.inline_data);
    const inline = imagePart?.inlineData ?? imagePart?.inline_data;

    if (!inline) {
      return new Response(
        JSON.stringify({ error: "El modelo no devolvió una imagen", detalle: data }),
        { status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        imagenBase64: inline.data,
        mimeType: inline.mimeType ?? inline.mime_type ?? "image/png",
      }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno", detalle: String(err) }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    );
  }
});
