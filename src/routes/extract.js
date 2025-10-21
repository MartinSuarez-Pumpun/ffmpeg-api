var express = require('express')
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const uniqueFilename = require('unique-filename');
var archiver = require('archiver');
const path = require('path');

const constants = require('../constants.js');
const logger = require('../utils/logger.js');
const utils = require('../utils/utils.js');

var router = express.Router();


//routes for /video/extract
//extracts audio from video
//extracts images from vide
router.post('/audio', function (req, res,next) {

    res.locals.extract="audio"
    return extract(req,res,next);
});

router.post('/images', function (req, res,next) {

    res.locals.extract="images"
    return extract(req,res,next);
});

router.get('/download/:filename', function (req, res,next) {
    //download extracted image
    let filename = req.params.filename;
    let file = `/tmp/${filename}`
    return utils.downloadFile(file,null,req,res,next);
});

// extract audio or images from video
function extract(req,res,next) {
    let extract = res.locals.extract;
    logger.debug(`extract ${extract}`);
    
    let fps = req.query.fps || 1;
    //compress = zip or gzip
    let compress = req.query.compress || "none";
    let ffmpegParams ={};
    var format = "png";

    // parse optional ffmpeg args from query or uploaded field
    function parseFFmpegArgs(argString) {
        if (!argString) return null;
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

    // Prefer params from request body (req.body.params) which should be an array.
    // Fallback order: req.body.params, req.body.ffmpeg, res.locals.paramsParsed, res.locals.paramsRaw, query or uploaded ffmpeg
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

    if (extract === "images"){
        format = "png"
        // if custom args provided, use them; otherwise default to fps
        if (parsedArgs && parsedArgs.length > 0) {
            ffmpegParams.outputOptions = parsedArgs;
        } else {
            ffmpegParams.outputOptions=[
                `-vf fps=${fps}`
            ];    
        }
    }
    if (extract === "audio"){
        format = "wav"
        if (parsedArgs && parsedArgs.length > 0) {
            ffmpegParams.outputOptions = parsedArgs;
        } else {
            ffmpegParams.outputOptions=[
                '-vn',
                `-f ${format}` 
            ];    
        }
        let monoAudio = req.query.mono || "yes";
        if (monoAudio === "yes" || monoAudio === "true")
        {
            logger.debug("extracting audio, 1 channel only")
            // only add if not already present in custom args
            if (!ffmpegParams.outputOptions.includes('-ac') && !ffmpegParams.outputOptions.includes('-ac1') ) {
                ffmpegParams.outputOptions.push('-ac 1')
            }
        }
        else{
            logger.debug("extracting audio, all channels")
        }
    }

    ffmpegParams.extension = format;

    let savedFile = res.locals.savedFile;
    const originalName = res.locals.originalFilename || path.basename(savedFile);
    const baseName = originalName.indexOf('.') > -1 ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;

    // For images, use a timestamped prefix to avoid collisions; for audio use same base name
    var timestamp = Date.now();
    var outputPrefix = `${baseName}-${timestamp}`;
    logger.debug(`outputPrefix ${outputPrefix}`);

    //ffmpeg processing...
    var ffmpegCommand = ffmpeg(savedFile);
    ffmpegCommand = ffmpegCommand
            .renice(constants.defaultFFMPEGProcessPriority)
            .outputOptions(ffmpegParams.outputOptions)
            .on('error', function(err) {
                logger.error(`${err}`);
                utils.deleteFile(savedFile);
                res.writeHead(500, {'Connection': 'close'});
                res.end(JSON.stringify({error: `${err}`}));
            })

    //extract audio track from video as wav
    if (extract === "audio"){
        let wavFile = path.join('/tmp', `${baseName}.${format}`);
        ffmpegCommand
            .on('end', function() {
                logger.debug(`ffmpeg process ended`);

                utils.deleteFile(savedFile)
                return utils.downloadFile(wavFile, `${baseName}.${format}`, req,res,next);
            })
          .save(wavFile);
        
        }

    //extract png images from video
    if (extract === "images"){
        // output files will look like /tmp/<outputPrefix>-%04d.png
        var outputFile = `/tmp/${outputPrefix}`;
        ffmpegCommand
            .output(`${outputFile}-%04d.png`)
            .on('end', function() {
                logger.debug(`ffmpeg process ended`);

                utils.deleteFile(savedFile)

                //read extracted files
                var files = fs.readdirSync('/tmp/').filter(fn => fn.startsWith(outputPrefix));
                
                if (compress === "zip" || compress === "gzip")
                {
                    //do zip or tar&gzip of all images and download file
                    var archive = null;
                    var extension = "";
                    if (compress === "gzip") {
                        archive = archiver('tar', {
                            gzip: true,
                            zlib: { level: 9 } // Sets the compression level.
                        });
                        extension = "tar.gz";
                    }
                    else {
                        archive = archiver('zip', {
                            zlib: { level: 9 } // Sets the compression level.
                        });
                        extension = "zip";
                    }

                    let compressFileName = `${uniqueFileNamePrefix}.${extension}`
                    let compressFilePath = `/tmp/${compressFileName}`
                    logger.debug(`starting ${compress} process ${compressFilePath}`);
                    var compressFile = fs.createWriteStream(compressFilePath);

                    archive.on('error', function(err) {
                      return next(err);
                    });
                    
                    // pipe archive data to the output file
                    archive.pipe(compressFile);
                    
                    // add files to archive
                    for (var i=0; i < files.length; i++) {
                        var file = `/tmp/${files[i]}`;
                        archive.file(file, {name: files[i]});
                    }
                    
                    // listen for all archive data to be written
                    // 'close' event is fired only when a file descriptor is involved
                    compressFile.on('close', function() {
                        logger.debug(`${compressFileName}: ${archive.pointer()} total bytes`);
                        logger.debug('archiver has been finalized and the output file descriptor has closed.');

                        // delete all images
                        for (var i=0; i < files.length; i++) {
                            var file = `/tmp/${files[i]}`;
                            utils.deleteFile(file);
                        }

                        //return compressed file
                        return utils.downloadFile(compressFilePath,compressFileName,req,res,next);

                    });
                    // Wait for streams to complete
                    archive.finalize();

                }
                else
                {
                    //return JSON list of extracted images

                    logger.debug(`output files in /tmp`);
                    var responseJson = {};
                    let externalPort = constants.externalPort || constants.serverPort;
                    responseJson["totalfiles"] = files.length;
                    responseJson["description"] = `Extracted image files and URLs to download them. By default, downloading image also deletes the image from server. Note that port ${externalPort} in the URL may not be the same as the real port, especially if server is running on Docker/Kubernetes.`;
                    var filesArray=[];
                    for (var i=0; i < files.length; i++) {
                        var file = files[i];             
                        logger.debug("file: " + file);
                        var fileJson={};
                        fileJson["name"] = file;
                        fileJson[`url`] = `${req.protocol}://${req.hostname}:${externalPort}${req.baseUrl}/download/${file}`;
                        filesArray.push(fileJson);                    
                    }             
                    responseJson["files"] = filesArray;
                    res.status(200).send(responseJson);

                }
            })
            .run();

    }

}

module.exports = router