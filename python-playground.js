"use strict";

// editor

const editor = ace.edit("editor");
editor.setTheme("ace/theme/chrome");
editor.session.setMode("ace/mode/python");
editor.session.setFoldStyle("manual");
editor.commands.addCommand({
    name: "Run",
    bindKey: { win: "Shift-Enter", mac: "Shift-Enter" },
    exec: function (editor) {
        runProgram();
    },
});
editor.setValue("print('Hello, world!')", 1);
editor.focus();

// console output

const output = document.getElementById("output");

// run button

const runButton = document.getElementById("runButton");
runButton.addEventListener("click", function (event) {
    runProgram();
});

// Pyodide

function input_fixed(text) {
    return window.prompt(text);
}

async function main() {
    let pyodide = await loadPyodide({
        stdout: (text) => { addToOutput(text); },
        stderr: (text) => { addToError(text); }
    });
    return pyodide;
}
let pyodideReadyPromise = main();

function addToOutput(s) {
    if (s == "Python initialization complete") {
        addToInfo(s);
        return;
    }
    output.innerHTML += sanitize(s) + "<br />";
}

function sanitize(s) {
    return String(s).replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/ /g, "&nbsp;");
}

function addToError(s) {
    let first = true;
    let skipNext = false;
    let sourceLines;
    let messageLines = [];
    for (let line of s.toString().split("\n")) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        if (line.indexOf("site-packages/_pyodide/_base.py") >= 0) {
            skipNext = true;
            continue;
        }
        if (line.indexOf('File "<exec>"') >= 0) {
            first = false;
            continue;
        }
        const m = line.match(/\s*File "<string>".*line ([0-9]+)/);
        line = line.replace('File "<string>"', 'File "main.py"');
        messageLines.push(line);
        if (m) {
            const lineNo = parseInt(m[1]);
            if (!sourceLines) {
                sourceLines = editor.getValue().split("\n");
            }
            messageLines.push("    " + sourceLines[lineNo - 1].trimEnd());
        }
    }
    let html = "";
    for (let i = 0; i < messageLines.length - 1; i++) {
        if (messageLines[i].trim() == messageLines[i + 1].trim()) {
            messageLines.splice(i, 1);
            i--;
        }
    }
    for (const line of messageLines) {
        html += sanitize(line) + "<br />";
    }
    output.innerHTML += '<span class="error">' + html + "</span>";
}

function addToInfo(s) {
    output.innerHTML += '<span class="info">' + sanitize(s) + "</span><br />";
}

async function runProgram() {
    output.textContent = "";

    const pyodide = await pyodideReadyPromise;
    const t0 = performance.now();
    try {
        pyodide.globals.set("__code_to_run__", editor.getValue());
        pyodide.runPython(
            "from js import input_fixed as __input_fixed__;" +
            "input = __input_fixed__;" +
            "__builtins__.input = __input_fixed__;" +
            "exec(__code_to_run__, {})");
    } catch (error) {
        addToError(error);
    }
    const t1 = performance.now();
    addToInfo("Completed in " + Math.floor(t1 - t0) / 1000 + "s");
}
