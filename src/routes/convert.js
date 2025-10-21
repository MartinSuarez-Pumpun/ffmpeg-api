var express = require('express')
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

const constants = require('../constants.js');
const logger = require('../utils/logger.js')
const utils = require('../utils/utils.js')

var router = express.Router()


//routes for /convert
//adds conversion type and format to res.locals. to be used in final post function
router.post('/audio/to/mp3', function (req, res,next) {

    res.locals.conversion="audio";
    res.locals.format="mp3";
    return convert(req,res,next);
});

router.post('/audio/to/wav', function (req, res,next) {

    res.locals.conversion="audio";
    res.locals.format="wav";
    return convert(req,res,next);
});

router.post('/video/to/mp4', function (req, res,next) {

    res.locals.conversion="video";
    res.locals.format="mp4";
    return convert(req,res,next);
});

router.post('/image/to/jpg', function (req, res,next) {

    res.locals.conversion="image";
    res.locals.format="jpg";
    return convert(req,res,next);
});

// convert audio or video or image to mp3 or mp4 or jpg
function convert(req,res,next) {
    let format = res.locals.format;
    let conversion = res.locals.conversion;
    logger.debug(`path: ${req.path}, conversion: ${conversion}, format: ${format}`);

        // helper: parse ffmpeg args string into array, preserving quoted sections
        function parseFFmpegArgs(argString) {
            if (!argString) return null;
            // simple parser: split by space but keep quoted substrings
            const args = [];
            let current = '';
            let inQuotes = false;
            let quoteChar = null;
            for (let i = 0; i < argString.length; i++) {
                const ch = argString[i];
                if ((ch === '"' || ch === "'") && !inQuotes) {
                    inQuotes = true;
                    quoteChar = ch;
                    continue;
                }
                if (ch === quoteChar && inQuotes) {
                    inQuotes = false;
                    quoteChar = null;
                    continue;
                }
                if (ch === ' ' && !inQuotes) {
                    if (current.length > 0) {
                        args.push(current);
                        current = '';
                    }
                    continue;
                }
                current += ch;
            }
            if (current.length > 0) args.push(current);
            return args;
        }

        let ffmpegParams ={
            extension: format
        };

        // Prefer params from request body (req.body.params) which should be an array.
        // Fallback order:
        // 1) req.body.params (array or string)
        // 2) req.body.ffmpeg (array or string)
        // 3) res.locals.paramsParsed (set by multipart upload)
        // 4) res.locals.paramsRaw
        // 5) req.query.ffmpeg or res.locals.ffmpegArgsRaw
        let parsedArgs = null;
        if (req.body && req.body.params) {
            if (Array.isArray(req.body.params)) {
                parsedArgs = req.body.params;
            } else if (typeof req.body.params === 'string') {
                parsedArgs = parseFFmpegArgs(req.body.params);
            }
        }

        if (!parsedArgs && req.body && req.body.ffmpeg) {
            if (Array.isArray(req.body.ffmpeg)) {
                parsedArgs = req.body.ffmpeg;
            } else if (typeof req.body.ffmpeg === 'string') {
                parsedArgs = parseFFmpegArgs(req.body.ffmpeg);
            }
        }

        if (!parsedArgs && res.locals && res.locals.paramsParsed) {
            parsedArgs = res.locals.paramsParsed;
        }
        if (!parsedArgs && res.locals && res.locals.paramsRaw) {
            parsedArgs = parseFFmpegArgs(res.locals.paramsRaw);
        }
        if (!parsedArgs) {
            const ffmpegArgsRaw = req.query.ffmpeg || res.locals.ffmpegArgsRaw;
            parsedArgs = parseFFmpegArgs(ffmpegArgsRaw);
        }
        if (parsedArgs && parsedArgs.length > 0) {
            logger.debug(`Using custom ffmpeg args: ${JSON.stringify(parsedArgs)}`);
            ffmpegParams.outputOptions = parsedArgs;
        }
    // only apply defaults if no custom ffmpeg args were provided
    if (!ffmpegParams.outputOptions) {
        if (conversion == "image")
        {
            ffmpegParams.outputOptions= ['-pix_fmt yuv422p'];
        }
        if (conversion == "audio")
        {
            if (format === "mp3")
            {
                ffmpegParams.outputOptions=['-codec:a libmp3lame' ];
            }
            if (format === "wav")
            {
                ffmpegParams.outputOptions=['-codec:a pcm_s16le' ];
            }
        }
        if (conversion == "video")
        {
            ffmpegParams.outputOptions=[
                '-codec:v libx264',
                '-profile:v high',
                '-r 15',
                '-crf 23',
                '-preset ultrafast',
                '-b:v 500k',
                '-maxrate 500k',
                '-bufsize 1000k',
                '-vf scale=-2:640',
                '-threads 8',
                '-codec:a libfdk_aac',
                '-b:a 128k',
            ];
        }
    }

    let savedFile = res.locals.savedFile;
    // derive output filename from original filename if available
    const originalName = res.locals.originalFilename || path.basename(savedFile);
    const baseName = originalName.indexOf('.') > -1 ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
    let outputFileName = `${baseName}.${ffmpegParams.extension}`;
    let outputFilePath = path.join('/tmp', outputFileName);
    logger.debug(`begin conversion from ${savedFile} to ${outputFilePath}`)

    //ffmpeg processing... converting file...
    let ffmpegConvertCommand = ffmpeg(savedFile);
    ffmpegConvertCommand
            .renice(constants.defaultFFMPEGProcessPriority)
            .outputOptions(ffmpegParams.outputOptions)
            .on('error', function(err) {
                logger.error(`${err}`);
                utils.deleteFile(savedFile);
                res.writeHead(500, {'Connection': 'close'});
                res.end(JSON.stringify({error: `${err}`}));
            })
            .on('end', function() {
                utils.deleteFile(savedFile);
                return utils.downloadFile(outputFilePath, outputFileName, req, res, next);
            })
            .save(outputFilePath);
}

module.exports = router