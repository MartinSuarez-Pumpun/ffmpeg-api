var express = require('express')
const fs = require('fs');
const Busboy = require('busboy');
const uniqueFilename = require('unique-filename');

var router = express.Router()
const logger = require('../utils/logger.js')

//route to handle file upload in all POST requests
//file is saved to res.locals.savedFile and can be used in subsequent routes.
router.use(function (req, res,next) {
    
    if(req.method == "POST")
    {
        logger.debug(`${__filename} path: ${req.path}`);

        // Only parse multipart/form-data uploads. If body is JSON (application/json)
        // we should not try to parse it here so route handlers can read req.body.ffmpeg.
        const contentType = req.headers['content-type'] || '';
        if (!contentType.startsWith('multipart/form-data')) {
            logger.debug('Not a multipart upload, skipping busboy and passing to next middleware');
            return next();
        }

        let bytes = 0;
        let hitLimit = false;
        let fileName = '';
        var savedFile = uniqueFilename('/tmp/');
        // allow one non-file field named 'ffmpeg' to pass custom ffmpeg args
        let busboy = new Busboy({
            headers: req.headers,
            limits: {
                fields: 1, // allow one non-file field (ffmpeg)
                files: 1,
                fileSize: fileSizeLimit,
        }});
        busboy.on('filesLimit', function() {
            logger.error(`upload file size limit hit. max file size ${fileSizeLimit} bytes.`)
        });
        busboy.on('fieldsLimit', function() {
            let msg="Too many non-file fields detected. Only one optional 'ffmpeg' field is allowed.";
            logger.error(msg);
            let err = new Error(msg);
            err.statusCode = 400;
            next(err);
        });

        // capture optional form fields: 'ffmpeg' (string) and 'params' (JSON array preferred)
        busboy.on('field', function(fieldname, val) {
            if (fieldname === 'ffmpeg') {
                logger.debug(`received ffmpeg field: ${val}`);
                // store raw string for later parsing by routes
                res.locals.ffmpegArgsRaw = val;
            } else if (fieldname === 'params') {
                logger.debug(`received params field: ${val}`);
                // try to parse JSON array
                try {
                    const parsed = JSON.parse(val);
                    if (Array.isArray(parsed)) {
                        res.locals.paramsParsed = parsed;
                        logger.debug('params field parsed as JSON array');
                    } else {
                        // keep raw if not an array
                        res.locals.paramsRaw = val;
                        logger.debug('params field is JSON but not an array; saved as raw');
                    }
                } catch (e) {
                    // not JSON, save raw string
                    res.locals.paramsRaw = val;
                    logger.debug('params field is not valid JSON; saved raw string');
                }
            } else {
                logger.debug(`ignored non-file field: ${fieldname}`);
            }
        });

        busboy.on('file', function(
            fieldname,
            file,
            filename,
            encoding,
            mimetype
        ) {
            file.on('limit', function(file) {
                hitLimit = true;
                let msg = `${filename} exceeds max size limit. max file size ${fileSizeLimit} bytes.`
                logger.error(msg);
                res.writeHead(500, {'Connection': 'close'});
                res.end(JSON.stringify({error: msg}));
            });
            let log = {
                file: filename,
                encoding: encoding,
                mimetype: mimetype,
            };
            logger.debug(`file:${log.file}, encoding: ${log.encoding}, mimetype: ${log.mimetype}`);
            file.on('data', function(data) {
                bytes += data.length;
            });
            file.on('end', function(data) {
                log.bytes = bytes;
                logger.debug(`file: ${log.file}, encoding: ${log.encoding}, mimetype: ${log.mimetype}, bytes: ${log.bytes}`);
            });

            fileName = filename;
            savedFile = savedFile + "-" + fileName;
            // store original filename for downstream handlers
            res.locals.originalFilename = fileName;
            logger.debug(`uploading ${fileName}`)
            let written = file.pipe(fs.createWriteStream(savedFile));
            if (written) {
                logger.debug(`${fileName} saved, path: ${savedFile}`)
            }
        });
        busboy.on('finish', function() {
            if (hitLimit) {
                utils.deleteFile(savedFile);
                return;
            }
            logger.debug(`upload complete. file: ${fileName}`)
            res.locals.savedFile = savedFile;
            next();
        });
        return req.pipe(busboy);
    }
    next();
});

module.exports = router;