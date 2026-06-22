const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const MODEL = "gemini-3.1-flash-image-preview";

const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo no permitido" }), {
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
    const imagenAmbienteBase64 = body.imagenAmbienteBase64;
    const tipoTela = body.tipoTela;
    const colorTela = body.colorTela;
    const anchoCm = body.anchoCm;
    const altoCm = body.altoCm;
    const aberturaAnchoCm = body.aberturaAnchoCm;
    const aberturaAltoCm = body.aberturaAltoCm;
    const paredAnchoCm = body.paredAnchoCm;
    const paredAltoCm = body.paredAltoCm;

    if (!imagenAmbienteBase64) {
      return new Response(JSON.stringify({ error: "Falta la foto del ambiente" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const esScreen = tipoTela.toLowerCase().includes("screen");
    const descripcionTela = esScreen
      ? "Esta tela es translucida (deja pasar algo de luz), debe verse semi-transparente."
      : "Esta tela es opaca (black out), debe bloquear completamente la luz y verse solida.";

    let referenciaTexto = "";
    if (aberturaAnchoCm && aberturaAltoCm) {
      referenciaTexto += " Como referencia de escala: la abertura (ventana o puerta) visible en la foto mide aproximadamente " + aberturaAnchoCm + " cm de ancho x " + aberturaAltoCm + " cm de alto.";
    }
    if (paredAnchoCm && paredAltoCm) {
      referenciaTexto += " Como referencia de escala: la pared donde esta la abertura mide aproximadamente " + paredAnchoCm + " cm de ancho x " + paredAltoCm + " cm de alto.";
    }
    if (referenciaTexto) {
      referenciaTexto += " Usa estas referencias SOLO para calcular la proporcion correcta en la imagen entre la abertura y la cortina. La cortina debe dibujarse con sus medidas reales (" + anchoCm + " cm x " + altoCm + " cm), no con las medidas de la abertura.";
    }

    const prompt = "Edita esta foto de un ambiente agregando una cortina roller instalada en la ventana visible. " +
      "Especificaciones de la cortina (estas son las medidas reales y definitivas, ya definidas por el usuario en su presupuesto): " +
      "Tipo de tela: " + tipoTela + ". " +
      "Color: " + colorTela + ". " +
      "Medidas de la cortina: " + anchoCm + " cm de ancho x " + altoCm + " cm de alto." +
      referenciaTexto + " " +
      "La cortina debe verse instalada de forma realista, respetando la perspectiva, la luz y las sombras del ambiente original. " +
      descripcionTela + " " +
      "No modifiques el resto del ambiente, solo agrega la cortina en la ventana.";

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + GEMINI_API_KEY,
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

    const candidates = data.candidates || [];
    const firstCandidate = candidates[0] || {};
    const content = firstCandidate.content || {};
    const parts = content.parts || [];

    let inline = null;
    for (const p of parts) {
      if (p.inlineData) {
        inline = p.inlineData;
        break;
      }
      if (p.inline_data) {
        inline = p.inline_data;
        break;
      }
    }

    if (!inline) {
      return new Response(
        JSON.stringify({ error: "El modelo no devolvio una imagen", detalle: data }),
        { status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        imagenBase64: inline.data,
        mimeType: inline.mimeType || inline.mime_type || "image/png",
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
