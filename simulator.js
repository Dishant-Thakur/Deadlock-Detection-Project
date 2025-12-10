
const allocTable = document.getElementById("allocTable");
const reqTable   = document.getElementById("reqTable");
const availTable = document.getElementById("availTable");
const logBox     = document.getElementById("logBox");
const summaryBox = document.getElementById("summary");
const deadList   = document.getElementById("deadList");
const ragBox     = document.getElementById("ragBox");

let cpuChart = null; 


function log(msg) {
    const div = document.createElement("div");
    div.textContent = msg;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

function buildMatrix(table, rows, cols, isAvail = false) {
    table.innerHTML = "";
    const thead = document.createElement("thead");
    const hRow  = document.createElement("tr");

    const thEmpty = document.createElement("th");
    hRow.appendChild(thEmpty);

    for (let j = 0; j < cols; j++) {
        const th = document.createElement("th");
        th.textContent = "R" + j;
        hRow.appendChild(th);
    }
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (let i = 0; i < rows; i++) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = isAvail ? "Avail" : "P" + i;
        tr.appendChild(th);

        for (let j = 0; j < cols; j++) {
            const td = document.createElement("td");
            const input = document.createElement("input");
            input.type = "number";
            input.min  = "0";
            input.value = "0";
            td.appendChild(input);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
}

function generateMatrices() {
    const n = parseInt(document.getElementById("numProc").value || "0", 10);
    const m = parseInt(document.getElementById("numRes").value  || "0", 10);

    if (n <= 0 || m <= 0) {
        alert("Please enter positive numbers for processes and resources.");
        return;
    }

    buildMatrix(allocTable, n, m, false);
    buildMatrix(reqTable,   n, m, false);
    buildMatrix(availTable, 1, m, true);

    logBox.innerHTML = "";
    ragBox.innerHTML = "";
    summaryBox.innerHTML = "Matrices generated. Enter values or load a scenario, then click Detect Deadlock.";
    deadList.innerHTML = "";
}
window.generateMatrices = generateMatrices;

function tableToMatrix(table, rows, cols) {
    const matrix = [];
    const inputs = table.querySelectorAll("tbody input");
    let idx = 0;
    for (let i = 0; i < rows; i++) {
        matrix[i] = [];
        for (let j = 0; j < cols; j++) {
            const val = parseInt(inputs[idx++].value || "0", 10);
            matrix[i][j] = isNaN(val) ? 0 : val;
        }
    }
    return matrix;
}

function tableToVector(table, cols) {
    const vec = [];
    const inputs = table.querySelectorAll("tbody input");
    for (let j = 0; j < cols; j++) {
        const val = parseInt(inputs[j].value || "0", 10);
        vec[j] = isNaN(val) ? 0 : val;
    }
    return vec;
}


function detectDeadlock() {
    logBox.innerHTML = "";
    ragBox.innerHTML = "";
    deadList.innerHTML = "";

    const n = parseInt(document.getElementById("numProc").value || "0", 10);
    const m = parseInt(document.getElementById("numRes").value  || "0", 10);

    if (n <= 0 || m <= 0) {
        alert("Please generate matrices first.");
        return;
    }

    const alloc = tableToMatrix(allocTable, n, m);
    const req   = tableToMatrix(reqTable,   n, m);
    const avail = tableToVector(availTable, m);

    log("Starting deadlock detection...");
    log("Available = [" + avail.join(", ") + "]");

    const work   = [...avail];
    const finish = new Array(n).fill(false);
    const safeSeq = [];

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < n; i++) {
            if (!finish[i]) {
                let canFinish = true;
                for (let j = 0; j < m; j++) {
                    if (req[i][j] > work[j]) {
                        canFinish = false;
                        break;
                    }
                }
                if (canFinish) {
                    log(`P${i} can finish (Request ≤ Work). Releasing its allocation.`);
                    for (let j = 0; j < m; j++) {
                        work[j] += alloc[i][j];
                    }
                    finish[i] = true;
                    safeSeq.push(i);
                    changed = true;
                    log("Work becomes [" + work.join(", ") + "]");
                }
            }
        }
    }

    const deadlocked = [];
    for (let i = 0; i < n; i++) {
        if (!finish[i]) deadlocked.push(i);
    }

    // Clear previous highlights
    allocTable.querySelectorAll("tbody tr").forEach(tr => tr.classList.remove("highlight-deadlocked","highlight-safe"));
    reqTable.querySelectorAll("tbody tr").forEach(tr => tr.classList.remove("highlight-deadlocked","highlight-safe"));

    if (deadlocked.length === 0) {
        summaryBox.innerHTML = `<span class="badge badge-success">No Deadlock</span> Safe sequence: ${safeSeq.map(i=>"P"+i).join(" → ")}`;
        allocTable.querySelectorAll("tbody tr").forEach(tr => tr.classList.add("highlight-safe"));
        reqTable.querySelectorAll("tbody tr").forEach(tr => tr.classList.add("highlight-safe"));
    } else {
        summaryBox.innerHTML = `<span class="badge badge-danger">Deadlock Detected</span> Some processes can never complete.`;
        deadList.innerHTML = "Deadlocked: " + deadlocked.map(i=>`<span class="badge badge-danger" style="margin-right:4px;">P${i}</span>`).join("");
        deadlocked.forEach(i => {
            const trA = allocTable.querySelectorAll("tbody tr")[i];
            const trR = reqTable.querySelectorAll("tbody tr")[i];
            if (trA) trA.classList.add("highlight-deadlocked");
            if (trR) trR.classList.add("highlight-deadlocked");
        });
    }

    buildRAGView(alloc, req, n, m);
    updateCPUChart(alloc, req, deadlocked, n, m);
}
window.detectDeadlock = detectDeadlock;

function buildRAGView(alloc, req, n, m) {
    ragBox.innerHTML = "";
    const title = document.createElement("div");
    title.textContent = "Resource Allocation Graph (textual)";
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";
    ragBox.appendChild(title);

    const desc = document.createElement("div");
    desc.textContent = "P → R = request, R → P = allocation.";
    desc.style.marginBottom = "6px";
    ragBox.appendChild(desc);

    for (let i = 0; i < n; i++) {
        const block = document.createElement("div");
        block.className = "rag-edge";
        let allocStr = [];
        let reqStr   = [];
        for (let j = 0; j < m; j++) {
            if (alloc[i][j] > 0) allocStr.push(`R${j} → P${i} (x${alloc[i][j]})`);
            if (req[i][j]   > 0) reqStr.push(`P${i} → R${j} (x${req[i][j]})`);
        }
        block.innerHTML = `<b>P${i}</b>` +
            (allocStr.length ? "<br>Allocated: " + allocStr.join(", ") : "") +
            (reqStr.length   ? "<br>Requests: "  + reqStr.join(", ")   : "");
        ragBox.appendChild(block);
    }
}

// ====== CPU CHART ======
function updateCPUChart(alloc, req, deadlocked, n, m) {
    const labels = [];
    const loads  = [];
    const colors = [];
    const borders = [];

    for (let i = 0; i < n; i++) {
        labels.push("P" + i);
        let sum = 0;
        for (let j = 0; j < m; j++) sum += alloc[i][j] + req[i][j];
        loads.push(sum);

        if (deadlocked.includes(i)) {
            colors.push("rgba(248,113,113,0.85)");
            borders.push("rgba(248,113,113,1)");
        } else {
            colors.push("rgba(56,189,248,0.9)");
            borders.push("rgba(56,189,248,1)");
        }
    }

    const ctx = document.getElementById("cpuChart").getContext("2d");
    if (!cpuChart) {
        cpuChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Relative CPU Load (Alloc + Request)",
                    data: loads,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800 },
                scales: {
                    x: { ticks: { color: "#e5e7eb" } },
                    y: { beginAtZero: true, ticks: { color: "#e5e7eb" } }
                },
                plugins: { legend: { labels: { color: "#e5e7eb" } } }
            }
        });
    } else {
        cpuChart.data.labels = labels;
        cpuChart.data.datasets[0].data = loads;
        cpuChart.data.datasets[0].backgroundColor = colors;
        cpuChart.data.datasets[0].borderColor = borders;
        cpuChart.update();
    }
}

const scenarios = {
    safe: {
        n: 3, m: 3,
        alloc: [
            [0,1,0],
            [2,0,0],
            [3,0,3]
        ],
        req: [
            [0,0,0],
            [2,1,1],
            [0,0,0]
        ],
        avail: [0,0,1]
    },
    dead1: {
        n: 3, m: 3,
        alloc: [
            [1,0,1],
            [0,1,0],
            [1,0,0]
        ],
        req: [
            [0,1,0],
            [1,0,1],
            [0,1,0]
        ],
        avail: [0,0,0]
    },
    dead2: {
        n: 4, m: 2,
        alloc: [
            [1,0],
            [0,1],
            [1,0],
            [0,1]
        ],
        req: [
            [0,1],
            [1,0],
            [0,1],
            [1,0]
        ],
        avail: [0,0]
    }
};

function randomScenario() {
    const n = 3 + Math.floor(Math.random() * 3); 
    const m = 2 + Math.floor(Math.random() * 3); 

    const alloc = [];
    const req   = [];
    const avail = [];

    for (let j = 0; j < m; j++) {
        avail[j] = Math.floor(Math.random() * 3);
    }
    for (let i = 0; i < n; i++) {
        alloc[i] = [];
        req[i]   = [];
        for (let j = 0; j < m; j++) {
            alloc[i][j] = Math.floor(Math.random() * 3);
            req[i][j]   = Math.floor(Math.random() * 3);
        }
    }
    return { n, m, alloc, req, avail };
}

function loadScenario() {
    const sel = document.getElementById("scenarioSelect").value;
    let scn;

    if (sel === "custom") {
        alert("Custom: first generate matrices, then type your own values.");
        return;
    } else if (sel === "random") {
        scn = randomScenario();
    } else {
        scn = scenarios[sel];
    }

    document.getElementById("numProc").value = scn.n;
    document.getElementById("numRes").value  = scn.m;
    generateMatrices();

    const allocInputs = allocTable.querySelectorAll("tbody input");
    const reqInputs   = reqTable.querySelectorAll("tbody input");
    const availInputs = availTable.querySelectorAll("tbody input");

    let idx = 0;
    for (let i = 0; i < scn.n; i++) {
        for (let j = 0; j < scn.m; j++) {
            allocInputs[idx++].value = scn.alloc[i][j];
        }
    }
    idx = 0;
    for (let i = 0; i < scn.n; i++) {
        for (let j = 0; j < scn.m; j++) {
            reqInputs[idx++].value = scn.req[i][j];
        }
    }
    for (let j = 0; j < scn.m; j++) {
        availInputs[j].value = scn.avail[j];
    }

    summaryBox.innerHTML = "Scenario loaded. Click Detect Deadlock.";
    logBox.innerHTML = "";
    ragBox.innerHTML = "";
}
window.loadScenario = loadScenario;

window.addEventListener("load", () => {
    generateMatrices();
});
