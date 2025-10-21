# ffmpeg API

An web service for converting audio, video and image files using FFMPEG.

This fork adds support for passing custom ffmpeg parameters, preserves original
filenames for outputs, and ships a Dockerfile + CI workflow that can publish
multi-architecture images.

Sources: https://github.com/samisalkosuo/ffmpeg-api

## ffmpeg API — index

This is the landing page returned by the service root. It describes the
lightweight HTTP API for converting and extracting media using ffmpeg.

Key features

- Convert audio/video/image formats (mp3, wav, mp4, jpg).
- Extract images or audio from video.
- Send custom ffmpeg parameters (recommended via JSON `params` array).
- Outputs use the original uploaded filename as the base name by default.
- Docker-friendly, includes a health endpoint and examples in the repository README.

Useful links

- Project README: ../README.md
- API endpoints index (human-readable): /endpoints

How to connect

The API accepts either multipart/form-data uploads (file + optional text fields)
or JSON POST bodies for endpoints that accept request bodies. When you connect
to the base path you will see this page; endpoints are under the `/convert`,
`/video`, and `/probe` routes.

Endpoints (common)

- POST /convert/audio/to/mp3 — convert uploaded audio/video/image to MP3
- POST /convert/audio/to/wav — convert to WAV
- POST /convert/video/to/mp4 — convert to MP4
- POST /convert/image/to/jpg — convert images to JPG
- POST /video/extract/audio — extract audio track from a video
- POST /video/extract/images — extract images (frames) from a video
- GET /video/extract/download/:filename — download an extracted image
- POST /probe — return ffprobe metadata for an uploaded file

How to send files

- Multipart form (recommended when uploading a file):
	- Use form field `file` for the uploaded media file.
	- Optional text fields: `params` (JSON array or space-separated string),
		`ffmpeg` (legacy single string), or `ffmpeg` in the query string.
- JSON body (useful for programmatic clients that already have the file on disk
	or via a pre-signed URL): send `params` as an array of strings in the JSON body
	and use a separate file upload endpoint if needed.

Passing custom ffmpeg parameters

Preferred: send `params` as a JSON array. Example body (application/json):

{
	"params": ["-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1"]
}

Fallbacks (in order of preference used by the server):
1) `req.body.params` (array or space-separated string)
2) `req.body.ffmpeg` (array or string)
3) multipart `params` field (JSON or string)
4) multipart `ffmpeg` field
5) query parameter `?ffmpeg=...`

Notes and safety

- When custom params are provided, the server will use them and will not apply
	the default preset options. This gives you full control but also full
	responsibility — be careful not to accidentally remove required options
	(codec or format) when building params.
- For public deployments consider whitelisting allowed ffmpeg options to avoid
	abuse.

Examples

- Convert AAC (input) to MP3 (output) 128 kbps mono using JSON params:

	POST /convert/audio/to/mp3 (multipart/form-data with `file`)

	Body (application/json or form field `params`):

	{
		"params": ["-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1"]
	}

- A simpler curl example (multipart form, `params` as a quoted string):

	curl -X POST -F "file=@my-audio.aac" -F "params=-codec:a libmp3lame -b:a 128k -ac 1" http://localhost:3000/convert/audio/to/mp3

Docker & health

- The provided Docker image runs an HTTP server and includes a simple health
	endpoint; see the repository `Dockerfile` and `.github/workflows` for build
	and publish automation.
- When running in Docker you may need to map external ports; by default the
	server advertises an external port (see `constants.js`) which may differ from
	the container port. Adjust URLs accordingly when downloading extracted images.

Troubleshooting

- If the server returns errors about missing codecs (for example `libfdk_aac`),
	the runtime ffmpeg image may not include that codec. Use an ffmpeg build with
	the necessary encoders or change params to use available codecs.

Want more?

See the top-level `README.md` for full curl examples, Docker usage, and CI notes.
