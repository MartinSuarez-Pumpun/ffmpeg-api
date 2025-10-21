= FFMPEG API

A web service for converting audio/video/image files using FFMPEG.

Based on:

* https://github.com/surebert/docker-ffmpeg-service
* https://github.com/jrottenberg/ffmpeg 
* https://github.com/fluent-ffmpeg/node-fluent-ffmpeg

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
** Query param: `delete=no` - does not delete file.
* `POST /probe` - Probe media file, return JSON metadata.

== Docker image

=== Build your own

* Clone this repository.
* Build Docker image:
** `docker build -t ffmpeg-api .`
* Run image in foreground:
** `docker run -it --rm --name ffmpeg-api -p 3000:3000 ffmpeg-api`
* Run image in background:
** `docker run -d --name ffmpeg-api -p 3000:3000 ffmpeg-api`

=== Use existing

* Run image in foreground:
** `docker run -it --rm --name ffmpeg-api -p 3000:3000 kazhar/ffmpeg-api`
* Run image in background:
** `docker run -d --name ffmpeg-api -p 3000:3000 kazhar/ffmpeg-api`

=== Environment variables

* Default log level is _info_. Set log level using environment variable, _LOG_LEVEL_.
** Set log level to debug:
** `docker run -it --rm -p 3000:3000 -e LOG_LEVEL=debug kazhar/ffmpeg-api`
* Default maximum file size of uploaded files is 512MB. Use environment variable _FILE_SIZE_LIMIT_BYTES_ to change it:
** Set max file size to 1MB:
** `docker run -it --rm -p 3000:3000 -e FILE_SIZE_LIMIT_BYTES=1048576 kazhar/ffmpeg-api`
* All uploaded and converted files are deleted when they've been downloaded. Use environment variable _KEEP_ALL_FILES_ to keep all files inside the container /tmp-directory:
** `docker run -it --rm -p 3000:3000 -e KEEP_ALL_FILES=true kazhar/ffmpeg-api`
* When running on Docker/Kubernetes, port binding can be different than default 3000. Use _EXTERNAL_PORT_ to set up external port in returned URLs in extracted images JSON:
** `docker run -it --rm -p 3001:3000 -e EXTERNAL_PORT=3001 kazhar/ffmpeg-api`


== Usage

Input file to FFMPEG API can be anything that ffmpeg supports. See https://www.ffmpeg.org/general.html#Supported-File-Formats_002c-Codecs-or-Features[ffmpeg docs for supported formats].

=== Convert

Convert audio/video/image files using the API.

You can run the following example curl commands (multipart form uploads):

```bash
curl -F "file=@input.wav" http://127.0.0.1:3000/convert/audio/to/mp3 > output.mp3
curl -F "file=@input.m4a" http://127.0.0.1:3000/convert/audio/to/wav > output.wav
curl -F "file=@input.mov" http://127.0.0.1:3000/convert/video/to/mp4 > output.mp4
curl -F "file=@input.mp4" http://127.0.0.1:3000/convert/video/to/mp4 > output.mp4
curl -F "file=@input.tiff" http://127.0.0.1:3000/convert/image/to/jpg > output.jpg
curl -F "file=@input.png" http://127.0.0.1:3000/convert/image/to/jpg > output.jpg
```

=== Passing custom ffmpeg parameters

You can pass custom ffmpeg parameters to control how ffmpeg processes the uploaded file. There are three supported ways to provide parameters (priority order):

1) JSON body field `params` (preferred when not using multipart uploads). Provide either an array or a string:

	 - Array form (most reliable):

		 {"params": ["-codec:v","libx264","-b:v","1M","-vf","scale=-2:720"]}

	 - String form (will be parsed, keep quoted fragments in quotes):

		 {"params": "-codec:v libx264 -b:v 1M -vf \"scale=-2:720\""}

2) JSON body field `ffmpeg` (fallback for backwards compatibility).

3) Multipart form field named `params` (JSON array string) or `ffmpeg` when uploading files using `-F` curl form uploads. The upload middleware will try to JSON.parse the `params` field and use it if it's a valid array.

If no custom params are provided, the server will use sensible defaults depending on the conversion route.

=== Example: convert a 320kbps 8-minute AAC to 128kbps MP3 (mono)

Assume you have a file `input.aac` (320kbps, 8 minutes). To convert it to a 128kbps mono MP3, the ffmpeg parameters you want are (from ffmpeg docs):

	- Use libmp3lame encoder: `-codec:a libmp3lame`
	- Set audio bitrate: `-b:a 128k`
	- Force mono: `-ac 1`

Below are two ways to do the conversion with this API.

1) JSON body (when sending binary file directly in the request body is not possible with curl easily, so this is mainly for programmatic clients that PUT the file bytes and JSON together — but the API supports JSON params this way):

	 Example JSON body (when your client sends the file via multipart or another mechanism and can also send JSON params):

	 {
		 "params": ["-codec:a","libmp3lame","-b:a","128k","-ac","1"]
	 }

	 If your client supports sending the file as raw bytes with JSON metadata, ensure the server receives the file bytes in the request body and the JSON is sent appropriately. For typical usage with curl, prefer multipart below.

2) Multipart form upload with curl (recommended):

		 - Array-as-JSON form field (curl):

	```bash
	curl -F "file=@input.aac" \
		-F 'params=["-codec:a","libmp3lame","-b:a","128k","-ac","1"]' \
		http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
	```

		 - String form (quoted string) form field (curl):

	```bash
	curl -F "file=@input.aac" \
		-F 'params=-codec:a libmp3lame -b:a 128k -ac 1' \
		http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
	```

Notes:
- Using the JSON array form for `params` is the safest because it avoids shell parsing issues.
- If a param is not supported by the server's ffmpeg (for example, missing codec), ffmpeg will fail and the API returns an error.
- Consider implementing a server-side whitelist/validation if exposing this API to untrusted clients.

=== Extract images

Extract images from video using the API.

```bash
    curl -F "file=@input.mov" http://127.0.0.1:3000/video/extract/images
```

Returns JSON that lists image download URLs for each extracted image. Default FPS is 1 and images are PNG.

```bash
    curl http://127.0.0.1:3000/video/extract/download/ba0f565c-0001.png --output ba0f565c-0001.png
```

Downloads extracted image and deletes it from server. To keep the file, use ?delete=no:

```bash
    curl http://127.0.0.1:3000/video/extract/download/ba0f565c-0001.png?delete=no --output ba0f565c-0001.png
```

```bash
    curl -F "file=@input.mov" "http://127.0.0.1:3000/video/extract/images?compress=zip" > images.zip
```

Returns ZIP package of all extracted images.

```bash
    curl -F "file=@input.mov" "http://127.0.0.1:3000/video/extract/images?compress=gzip" > images.tar.gz
```

Returns GZIP (tar.gz) package of all extracted images.

```bash
    curl -F "file=@input.mov" "http://127.0.0.1:3000/video/extract/images?fps=0.5"
```

Sets FPS to extract images. FPS=0.5 is every two seconds, FPS=4 is four images per second, etc.

=== Extract audio

Extract audio track from video using the API.

```bash
    curl -F "file=@input.mov" http://127.0.0.1:3000/video/extract/audio --output extracted.wav
```

Returns 1-channel WAV-file of video's audio track by default.

```bash
curl -F "file=@input.mov" "http://127.0.0.1:3000/video/extract/audio?mono=no" --output extracted_all_channels.wav
```

Returns WAV-file of video's audio track with all the channels as in input video.

=== Probe

Probe audio/video/image files using the API.

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/probe
```

Returns JSON metadata of media file. The same JSON metadata as in ffprobe command:
`ffprobe -of json -show_streams -show_format input.mov`.

See sample of MOV-video metadata: link:./samples/probe_metadata.json[probe_metadata.json].

=== Curl examples

Below are copy-pasteable curl examples for common workflows. These assume the server runs on localhost:3000. Adjust host/port as needed.

Convert audio (simple multipart):

```bash
curl -F "file=@input.wav" http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
```

Convert audio with custom params (multipart, JSON array in params field):

```bash
curl -F "file=@input.aac" \
	-F 'params=["-codec:a","libmp3lame","-b:a","128k","-ac","1"]' \
	http://127.0.0.1:3000/convert/audio/to/mp3 --output output.mp3
```

Convert video to mp4 (multipart):

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/convert/video/to/mp4 --output output.mp4
```

Convert using JSON body params (programmatic clients):

```bash
curl -X POST -H "Content-Type: application/json" -d '{"params":["-codec:a","libmp3lame","-b:a","128k","-ac","1"]}' http://127.0.0.1:3000/convert/audio/to/mp3
```

Extract audio from video (default mono WAV):

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/video/extract/audio --output extracted.wav
```

Extract audio all channels:

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/video/extract/audio?mono=no --output extracted_all_channels.wav
```

Extract images (default 1 fps):

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/video/extract/images
```

Extract images with fps=2 and zip compression:

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/video/extract/images?fps=2&compress=zip > images.zip
```

Download an extracted image (returned filenames are in the JSON response):

```bash
curl http://127.0.0.1:3000/video/extract/download/<filename> --output <filename>
```

Probe media file (returns ffprobe-style JSON):

```bash
curl -F "file=@input.mov" http://127.0.0.1:3000/probe
```

List endpoints:
```bash
    curl http://127.0.0.1:3000/endpoints
```

Notes:
- Use the `params` JSON array when possible to avoid quoting/escaping issues.
- When uploading via multipart, `params` should be a JSON array string. The server will try to parse it and use it directly.
- If you upload with `file=@...` and do not include an original filename, the server will fall back to a generated temp-name for the output filename.
- Adjust host/port if you use Docker or a different bind (see `EXTERNAL_PORT` in environment variables).


== Background

Originally developed by https://github.com/surebert[Paul Visco].                  

Changes include new functionality, updated Node.js version, Docker image based on Alpine, logging and other major refactoring.
