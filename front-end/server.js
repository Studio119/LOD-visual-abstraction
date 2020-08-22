/*
 * @Author: Antoine YANG 
 * @Date: 2019-11-15 21:47:38 
 * @Last Modified by: Antoine YANG
 * @Last Modified time: 2020-08-21 13:09:02
 */

const express = require('express');
const app = express();
const fs = require("fs");
const process = require('child_process');
const bodyParser = require('body-parser');

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(bodyParser.json());


const decodePath = path => {
    return path.split("@0x2F").join("/").split("@0x2E").join(".");
};


app.get("/local_file/:path", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3000");
    const path = decodePath(req.params["path"]);
    fs.readFile(path, (err, data) => {
        if (err) {
            res.json(err);
        } else {
            res.json(JSON.parse(data));
        }
    });
});


const server = app.listen(2369, () => {
    const addr = server.address().address;
    const host = addr === "::" ? "127.0.0.1" : addr;
    const port = server.address().port;
    console.log("Back-end server opened at http://" + host + ":" + port);
});
