import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve((_req: Request) => {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "retired_endpoint",
      message: "Direct Chat push delivery no longer uses the legacy Stream webhook.",
    }),
    {
      status: 410,
      headers: JSON_HEADERS,
    },
  );
});
