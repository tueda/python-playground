"use strict";

const INITIAL_PROGRAM = "print('Hello, world!')";

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
editor.setValue(INITIAL_PROGRAM, 1);
editor.focus();

// console output

const output = document.getElementById("output");

// run button

const runButton = document.getElementById("runButton");
runButton.addEventListener("click", function (event) {
    runProgram();
});

// Pyodide

// Fix input(prompt="...").
// See: https://github.com/pyodide/pyodide/issues/758#issuecomment-696418449
function inputFixed(text) {
    return window.prompt(text);
}

async function pyodideMain() {
    let pyodide = await loadPyodide({
        stdout: (text) => { addToOutput(text); },
        stderr: (text) => { addToError(text); }
    });
    return pyodide;
}
let pyodideReadyPromise = pyodideMain();

function escapeHTML(s) {
    return String(s).replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/ /g, "&nbsp;");
}

function addToOutput(s) {
    if (s == "Python initialization complete") {
        // This is printed once at the beginning.
        addToInfo(s);
        return;
    }
    output.innerHTML += escapeHTML(s) + "<br />";
}

function addToError(s) {
    let isFirst = true;
    let skipNext = false;
    let sourceLines;
    let messageLines = [];

    for (let line of s.toString().split("\n")) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        if (line.indexOf("site-packages/_pyodide/_base.py") >= 0) {
            // We don't like to print Pyodide-related lines.
            skipNext = true;
            continue;
        }
        if (line.indexOf('File "<exec>"') >= 0) {
            // First line, due to the eval(...).
            isFirst = false;
            continue;
        }

        const m = line.match(/\s*File "<string>".*line ([0-9]+)/);
        line = line.replace('File "<string>"', 'File "main.py"');
        messageLines.push(line);

        if (m) {
            // Runtime errors don't show the source code.
            // Put the source code at the corresponding line (for all errors).
            const lineNo = parseInt(m[1]);
            if (!sourceLines) {
                sourceLines = editor.getValue().split("\n");
            }
            messageLines.push("    " + sourceLines[lineNo - 1].trimEnd());
        }
    }

    // Compile-time errors show the source code and so we get duplicated lines.
    // Remove duplications.
    for (let i = 0; i < messageLines.length - 1; i++) {
        if (messageLines[i].trim() == messageLines[i + 1].trim()) {
            messageLines.splice(i, 1);
            i--;
        }
    }

    let html = "";
    for (const line of messageLines) {
        html += escapeHTML(line) + "<br />";
    }
    html = '<span class="error">' + html + "</span>";

    output.innerHTML += html;
}

function addToInfo(s) {
    output.innerHTML += '<span class="info">' + escapeHTML(s) + "</span><br />";
}

async function runProgram() {
    output.textContent = "";

    const pyodide = await pyodideReadyPromise;
    const t0 = performance.now();
    try {
        // Effectively, we clear user-defined names each time
        // by calling exec() with an empty namespace.
        // See: https://github.com/pyodide/pyodide/issues/703#issuecomment-772061144
        pyodide.globals.set("__code_to_run__", editor.getValue());
        pyodide.runPython(
            "from js import inputFixed as __input_fixed__;" +
            "input = __input_fixed__;" +
            "__builtins__.input = __input_fixed__;" +
            "exec(__code_to_run__, {})");
    } catch (error) {
        addToError(error);
    }
    const t1 = performance.now();
    addToInfo("Completed in " + Math.floor(t1 - t0) / 1000 + "s");
}
