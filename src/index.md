# ffmpeg API (short)

A tiny HTTP service that exposes ffmpeg functionality over a few simple
endpoints. Upload a file, optionally pass `params` to control ffmpeg, and
download the result.

Quick notes

- Preferred upload: multipart/form-data with field `file`.
- Preferred way to pass custom ffmpeg options: `params` as a JSON array.
- Outputs keep the original uploaded filename as the base name.

Common endpoints (most-used)

- POST /convert/audio/to/mp3
- POST /convert/audio/to/wav
- POST /convert/video/to/mp4
- POST /convert/image/to/jpg
- POST /video/extract/audio
- POST /video/extract/images
- GET /video/extract/download/:filename
- POST /probe

Example (quick)

Convert a file to mp3 with custom params (multipart curl):

```bash
curl -F "file=@input.aac" \
  -F 'params=["-codec:a","libmp3lame","-b:a","128k","-ac","1"]' \
  http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
```

If you need more examples or Docker/CI notes, open `/README.md` in the repo —
it has longer examples and environment variable notes.
