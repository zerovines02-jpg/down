export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Browser preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Only POST requests are allowed."
    });
  }

  try {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        error: "Instagram URL is required."
      });
    }

    // Basic Instagram URL validation
    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid Instagram URL."
      });
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    if (
      hostname !== "instagram.com" &&
      hostname !== "www.instagram.com"
    ) {
      return res.status(400).json({
        success: false,
        error: "Please enter an Instagram URL."
      });
    }

    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      console.error("APIFY_API_TOKEN is missing.");

      return res.status(500).json({
        success: false,
        error: "Server API configuration is missing."
      });
    }

    // Apify Actor
    const actorId = "snapinsta~instagram-downloader-api";

    const endpoint =
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
      `?token=${encodeURIComponent(token)}`;

    // Current Actor input format
    const apifyResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: url
      })
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();

      console.error("Apify error:", errorText);

      return res.status(502).json({
        success: false,
        error: "Unable to process this Instagram URL."
      });
    }

    const data = await apifyResponse.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No media found."
      });
    }

    const result = data[0];

    if (!result.status) {
      return res.status(404).json({
        success: false,
        error: "Media could not be found or is not supported."
      });
    }

    const media = Array.isArray(result.media)
      ? result.media
      : [];

    if (media.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No downloadable media found."
      });
    }

    // Clean response for Blogger frontend
    const items = media
      .filter(item => item && item.url)
      .map((item, index) => ({
        index,
        url: item.url,
        thumbnail: item.thumbnail || null,
        fileType: item.fileType || null
      }));

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Media URL was not returned."
      });
    }

    return res.status(200).json({
      success: true,
      sourceUrl: result.sourceUrl || url,
      requestId: result.requestId || null,
      count: items.length,
      media: items
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      success: false,
      error: "Something went wrong. Please try again."
    });
  }
}
