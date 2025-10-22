= FFMPEG API

A web service for converting audio/video/image files using FFMPEG.

Based on:

* https://github.com/surebert/docker-ffmpeg-service
* https://github.com/jrottenberg/ffmpeg 
* https://github.com/fluent-ffmpeg/node-fluent-ffmpeg
* https://github.com/samisalkosuo/ffmpeg-api

FFMPEG API is provided as Docker image for easy consumption.

== Endpoints

* `GET /` - API Readme.
* `GET /endpoints` - Service endpoints as JSON.
* `POST /convert/audio/to/mp3` - Convert audio file in request body to mp3. Returns mp3-file.
* `POST /convert/audio/to/wav` - Convert audio file in request body to wav. Returns wav-file.
* `POST /convert/video/to/mp4` - Convert video file in request body to mp4. Returns mp4-file.
* `POST /convert/image/to/jpg` - Convert image file to jpg. Returns jpg-file.
* `POST /video/extract/audio` - Extract audio track from POSTed video file. Returns audio track as 1-channel wav-file.
** Query param: `mono=no` - Returns audio track, all channels.
* `POST /video/extract/images` - Extract images from POSTed video file as PNG. Default FPS is 1. Returns JSON that includes download links to extracted images.
** Query param: `compress=zip|gzip` - Returns extracted images as _zip_ or _tar.gz_ (gzip).
** Query param: `fps=2` - Extract images using specified FPS. 
* `GET /video/extract/download/:filename` - Downloads extracted image file and deletes it from server.
# ffmpeg-api

A small HTTP service that makes ffmpeg available over a simple REST API. It
lets you upload media files (audio, video, images), run conversions or
extractions, and download the results. The project is provided as source
and as a Docker image so you can run it locally or in a container platform.

Quick links

- Docs (this file)
- API index: `/endpoints`
- Service landing page (human-friendly): `/`

Why use this

- Simple, scriptable HTTP API for ffmpeg conversions.
- Lets you provide custom ffmpeg parameters when you need precise control.
- Designed to be run in Docker for ease of deployment.

Getting started (local)

1. Build an image locally:

```bash
docker build -t ffmpeg-api .
```

2. Run it on port 3000:

```bash
docker run --rm -p 3000:3000 ffmpeg-api
```

3. Try a quick conversion (example):

```bash
curl -F "file=@input.wav" http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
```

Common endpoints

- GET / — human-friendly index (this README condensed)
- GET /endpoints — machine-readable list of registered routes
- POST /convert/audio/to/mp3
- POST /convert/audio/to/wav
- POST /convert/video/to/mp4
- POST /convert/image/to/jpg
- POST /video/extract/audio
- POST /video/extract/images
- GET /video/extract/download/:filename
- POST /probe

How to upload files

Preferred: multipart/form-data with field name `file` for the media payload.

Passing custom ffmpeg parameters

Preferred: send `params` as a JSON array in the request body (application/json)
or as a multipart form field named `params` containing a JSON array string.

Examples:

- JSON params (programmatic client):

```json
{"params":["-codec:a","libmp3lame","-b:a","128k","-ac","1"]}
```

- multipart curl (params as JSON array string):

```bash
curl -F "file=@input.aac" \
  -F 'params=["-codec:a","libmp3lame","-b:a","128k","-ac","1"]' \
  http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
```

Or pass `ffmpeg` as a single string (legacy):

```bash
curl -F "file=@input.aac" -F 'ffmpeg=-codec:a libmp3lame -b:a 128k -ac 1' http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
```

Notes on parameters

- The server prefers `params` (array) > `ffmpeg` (string) > query `ffmpeg`.
- When you supply custom params the server will use them as-is and will not
  apply default presets. Be careful to include required options (codec/format).

Docker & environment variables

- LOG_LEVEL — set log verbosity (default: info)
- FILE_SIZE_LIMIT_BYTES — max upload size in bytes (default configured in
  `src/constants.js`)
- KEEP_ALL_FILES — set to `true` to keep processed files under `/tmp` for
  debugging (default: false)
- EXTERNAL_PORT — when running in Docker, set this if ports are remapped so
  that generated download URLs use the right external port

Example: run with debug logs and a larger file size limit

```bash
docker run --rm -p 3000:3000 -e LOG_LEVEL=debug -e FILE_SIZE_LIMIT_BYTES=1073741824 ffmpeg-api
```

Production considerations

- Add authentication and rate limiting before exposing the service publicly.
- Consider a job queue (Redis + worker) if you expect multiple large, long
  running conversions — the current server spawns ffmpeg processes directly.
- Monitor CPU, memory, and disk I/O. ffmpeg jobs can be CPU- and I/O-heavy.

Troubleshooting

- Missing codecs: if ffmpeg reports a missing encoder (for example `libfdk_aac`)
  you’ll need an ffmpeg build that includes that codec or use a different
  encoder available in the runtime image.
- Large uploads failing: increase `FILE_SIZE_LIMIT_BYTES` or check Docker
  resource limits.

Contributing

PRs welcome. If you want help adding a worker queue, rate-limiting, or
authentication, open an issue describing how you'd like it to work and I can
help scaffold it.

License & credits

This project was inspired by existing ffmpeg service projects and uses
`fluent-ffmpeg` for the Node bindings. See the repository history for exact
references.
