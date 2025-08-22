  // --- General Configs ---
  const PY_MODULE_URL = "https://gistcdn.githack.com/BernardoDenkvitts/ec102fd60753ac142ff0d41ab317dfc9/raw/5f1ca51f34e5bffba44ab237e7f0f96ffd594e7b/ontology_generator.py";
  const PY_MODULE_NAME = "ontology_generator";
  const PY_FUNC_NAME   = "create_ontology";

  const RDF_TYPE_PREDICATE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
  const RDF_LABEL_PREDICATE = "http://www.w3.org/2000/01/rdf-schema#label"
  
  const RDF_IGNORE_PREDICATES = [
    RDF_TYPE_PREDICATE,
    RDF_LABEL_PREDICATE,
    "http://www.w3.org/2000/01/rdf-schema#subClassOf",
    "http://www.w3.org/2000/01/rdf-schema#domain",
    "http://www.w3.org/2000/01/rdf-schema#range",
    "http://www.w3.org/2000/01/rdf-schema#comment",
    "http://www.w3.org/2002/07/owl#inverseOf",
    "http://www.w3.org/2002/07/owl#versionIRI"
  ];

  const D3_STYLE = {
    node: {
      default: {
        radius: 15,
        fill: '#bdc3c7',
        stroke: '#34495e',
        strokeWidth: 2
      },
      classes: {
        domain: { fill: '#e74c3c' },
        problem: { fill: '#2ecc71' },
        action: { fill: '#3498db' },
        precondition: { fill: '#1abc9c' },
        effect: { fill: '#9b59b6' },
        predicate: { fill: '#f1c40f' },
        parameter: { fill: '#d35400' },
        planner: { fill: '#85bbbeff' }
      }
    },
    edge: {
      stroke: '#424c4cff',
      strokeWidth: 1.5,
      markerSize: 6
    },
    text: {
      fontSize: '10px',
      fontFamily: 'Arial, sans-serif',
      fill: '#2c3e50'
    }
  };

  const PLUGIN_LIBS = [
    "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js",
    "https://cdn.jsdelivr.net/npm/rdflib@2.2.6/dist/rdflib.min.js",
    "https://cdn.jsdelivr.net/npm/jsonld@1.8.1/dist/jsonld.min.js",
    "https://cdn.jsdelivr.net/npm/n3@1.17.3/browser/n3.min.js",
    "https://rdf.js.org/comunica-browser/versions/v4/engines/query-sparql/comunica-browser.js",
    "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"
  ];

  var PLUGIN_MODAL = `
  <div class="modal fade" id="chooseFiles" tabindex="-1" role="dialog"
      aria-labelledby="chooseModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">

        <div class="modal-body">
          <form class="form-horizontal">
            <div class="form-group">
              <label class="col-sm-4 control-label">Domain file</label>
              <div class="col-sm-6">
                <select id="domainSelect" class="form-control file-selection"></select>
              </div>
            </div>
            <div class="form-group">
              <label class="col-sm-4 control-label">Problem file</label>
              <div class="col-sm-6">
                <select id="problemSelect" class="form-control file-selection"></select>
              </div>
            </div>
          </form>
        </div>

        <div class="modal-footer">
          <button id="filesChosenBtn" class="btn btn-primary" data-dismiss="modal">
            Generate Ontology
          </button>
          <button type="button" class="btn btn-default" data-dismiss="modal">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>`;

  async function pyRun(code) {
    await window.pyodideReady;
    return await window.pyodide.runPythonAsync(code);
  }

  async function loadPyModuleFromURL(url, moduleName) {
    await window.pyodideReady;
    const sep = url.includes('?') ? '&' : '?';
    const cacheBust = `${sep}t=${Date.now()}`;
    const res = await fetch(url + cacheBust);
    if (!res.ok) throw new Error(`Error to fetch ${url}: ${res.status}`);
    const src = await res.text();

    window.pyodide.FS.writeFile(`${moduleName}.py`, src);
    await pyRun(`
  import importlib, sys
  if "${moduleName}" in sys.modules:
      importlib.reload(sys.modules["${moduleName}"])
  else:
      import ${moduleName}
    `);
    return window.pyodide.pyimport(moduleName);
  }

  async function createOntologyWithPython(domainText, problemText) {
    await loadPyModuleFromURL(PY_MODULE_URL, PY_MODULE_NAME);
    let pythonFunction;
    try {
     pythonFunction = await pyRun(`
  import importlib
  _m = importlib.import_module("${PY_MODULE_NAME}")
  getattr(_m, "${PY_FUNC_NAME}")
    `);
    } catch (e) {
      throw new Error(`Function "${PY_FUNC_NAME}" not found in module "${PY_MODULE_NAME}".`);
    }

    return pythonFunction(domainText, problemText);
  }

  define(function(require, exports, module) {
    function createKgTab(tabLabel) {
      // Create a new tab 
      createEditor();
      var editorId = window.current_editor;

      // Rename the tab
      $('#tab-' + editorId).text(tabLabel);

      // Get the container for the editor (which is shown/hidden)
      var $container = $('#' + editorId);

      $container.empty();

      var viewerId = editorId + '-kg-viewer';
      $container.html(createSparqlPanel(viewerId));

      return viewerId;
    }

    function createSparqlPanel(viewerId) { 
      return `
      <style>
        #${viewerId}.kg-root { 
          width:100%; height:100%; 
          display:grid; grid-template-columns: 1fr auto; 
          overflow:hidden; position:relative; 
          background:#fff;
        }
        #${viewerId} .kg-canvas { position:relative; background:#fff; }
        #${viewerId} .kg-canvas > svg { width:100%; height:100%; display:block; }

        #${viewerId} .kg-panel {
          width:360px; min-width:260px; max-width:70vw;
          height:100%; 
          background:#ffffff; 
          border-left:1px solid #e6e6e6;
          display:flex; flex-direction:column; 
          overflow:auto;
          resize: horizontal;
          padding:0;
        }
        
        #${viewerId} .kg-header {
          display:flex; align-items:center; gap:8px;
          padding:8px 10px; 
          border-bottom:1px solid #eee; 
          background:#f8f9fa;
          position:sticky; top:0; z-index:1;
        }
        #${viewerId} .kg-header h4 {
          margin:0; font-size:14px; font-weight:600; color:#222;
        }
        #${viewerId} .kg-header .spacer { flex:1; }

        #${viewerId} .kg-editor { padding:10px; border-bottom:1px solid #f0f0f0; }
        #${viewerId} .kg-editor textarea {
          width:100%; height:160px;
          font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
          border:1px solid #e2e2e2; border-radius:6px; padding:8px; outline:none;
        }
        #${viewerId} .kg-editor textarea:focus { border-color:#0d6efd; box-shadow:0 0 0 2px rgba(13,110,253,.15); }
        #${viewerId} .kg-actions { display:flex; gap:8px; margin-top:8px; }
        #${viewerId} .kg-actions .btn { padding:6px 10px; font-size:12px; }

        #${viewerId} .kg-output { padding:10px; }
        #${viewerId} .kg-output pre {
          margin:0; font-size:12px; white-space:pre-wrap;
          background:#fafafa; border:1px solid #eee; border-radius:6px; padding:10px;
          max-height:40vh; overflow:auto;
        }

        #${viewerId}-toggle { display:none; }
        #${viewerId} .kg-toggle {
          position:absolute; right:0; top:12px; 
          transform:translateX(100%);
          background:#0d6efd; color:#fff; 
          border-radius:6px 6px 6px 6px;
          font-size:12px; padding:6px 10px; cursor:pointer;
          box-shadow:0 2px 6px rgba(0,0,0,.15);
          user-select:none;
        }
        
        #${viewerId}-toggle:not(:checked) ~ .kg-panel { width:0 !important; min-width:0 !important; border-left:none; padding:0; overflow:hidden; }
        #${viewerId}-toggle:not(:checked) ~ .kg-toggle { background:#0d6efd; }
        #${viewerId}-toggle:not(:checked) ~ .kg-toggle::after { content:"Show SPARQL"; }
        #${viewerId}-toggle:checked ~ .kg-toggle::after { content:"Hide SPARQL"; }
      </style>

      <div id="${viewerId}" class="kg-root">
        <div class="kg-canvas">
          <svg id="${viewerId}-svg"></svg>
        </div>
        <input type="checkbox" id="${viewerId}-toggle" checked />
        <label class="kg-toggle" for="${viewerId}-toggle"></label>

        <aside class="kg-panel" id="${viewerId}-sparql-panel" aria-label="SPARQL panel">
          <div class="kg-header">
            <h4>SPARQL</h4>
            <div class="spacer"></div>
          </div>

          <div class="kg-editor">
            <textarea id="${viewerId}-sparql-input" placeholder="Enter SPARQL query here..."></textarea>
            <div class="kg-actions">
              <button id="${viewerId}-sparql-run"   class="btn btn-primary btn-sm">Run</button>
              <button id="${viewerId}-sparql-clear" class="btn btn-default btn-sm">Clear</button>
            </div>
          </div>

          <div class="kg-output">
            <pre id="${viewerId}-sparql-output"> </pre>
          </div>
        </aside>
      </div>
      `;
    }

    function addDownloadLink(container, ontologyString) {
      container.style.position ||= "relative";

      const btn = document.createElement("button");
      btn.textContent = "Download OWL file";
      btn.style.cssText =
        "position:absolute;top:10px;left:10px;z-index:99999;" +
        "background:white;padding:6px 10px;border-radius:4px;" +
        "border:1px solid #ddd;box-shadow:0 2px 4px rgba(0,0,0,.2);" +
        "cursor:pointer;pointer-events:auto";

      btn.addEventListener("click", () => {
        const blob = new Blob([ontologyString], { type: "application/rdf+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "ontology.owl";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url); 
      });

      container.appendChild(btn);
    }

    function fileChooser() {
      var domainOpts = "", problemOpts = "";

      window.pddl_files.forEach(function(fname) {
        if (window.closed_editors.includes(fname))
          return;

        var label = $('#tab-' + fname).text();
        var txt = ace.edit(fname).getSession().getValue();
        var opt = `<option value="${fname}">${label}</option>\n`;
        
        if (/\(domain/i.test(txt))
          domainOpts += opt;
        else if (/\(problem/i.test(txt))
          problemOpts += opt;
      });

      $('#domainSelect').html(domainOpts);
      $('#problemSelect').html(problemOpts);
      $('#chooseFiles').modal('toggle');
    }

    async function onFilesChosen() {
      $('#chooseFiles').modal('hide');

      // Get the text from the selected files
      var domainText  = ace.edit($('#domainSelect').val()).getSession().getValue();
      var problemText = ace.edit($('#problemSelect').val()).getSession().getValue();

      const ontologyJson = await createOntologyWithPython(domainText, problemText);
      createKnowledgeGraphTab(ontologyJson);
    }

    function loadScriptGlobal(url) {
      return new Promise(function(resolve, reject) {
        // disable AMD temporarily to avoid dependencies issues
        // Forcing the disable they go to global scope
        var windowDefine = window.define;
        var amd = windowDefine && windowDefine.amd;
        if (windowDefine) windowDefine.amd = false;

        var scriptElement = document.createElement("script");
        scriptElement.src   = url;
        scriptElement.async = true;

        scriptElement.onload  = function() {
          console.log("✓ Script loaded:", url);
          if (windowDefine) windowDefine.amd = amd;
          
          resolve();
        };  

        scriptElement.onerror = function(e) {
          console.error("✗ Error to load the script", url, e);
          if (windowDefine) windowDefine.amd = amd;
          
          reject(new Error("Error to load the script: " + url));
        };

        document.head.appendChild(scriptElement);
      });
    }

    async function loadPyodideRuntime() {
      if (window.pyodideReady) return window.pyodideReady;

      window.pyodideReady = new Promise((resolve, reject) => {
        if (!window.loadPyodide) {
          reject(new Error("Pyodide not loadead"));
          return;
        }
        loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
        })
          .then((pyodide) => {
            console.log("Pyodide loaded");
            window.pyodide = pyodide;
            resolve(pyodide);
          })
          .catch(reject);
      });
 
      return window.pyodideReady;
    }

    async function loadKgLibs() {
      window.toastr.info("Loading dependencies...");
      if (window.kgLibsLoading) return window.kgLibsLoading;

      window.kgLibsLoading = (async () => {
        try {
          for (let i = 0; i < PLUGIN_LIBS.length; i++) {
            await loadScriptGlobal(PLUGIN_LIBS[i]);

            if (i === 4) {
              if (!window.d3) throw new Error("window.d3 not exposed");
              if (!window.$rdf) throw new Error("window.$rdf not exposed");
              if (!window.N3) throw new Error("window.N3 not exposed");
              if (!window.Comunica) throw new Error("window.Comunica not exposed");
            }

            if (i === 5) {
              if (!window.loadPyodide) throw new Error("window.loadPyodide not exposed");
              await loadPyodideRuntime();
              console.log("✓ Pyodide runtime loaded");
              await window.pyodide.loadPackage('micropip');
              await window.pyodide.runPythonAsync(`
  import micropip
  await micropip.install(['pyodide-http', 'rdflib'])
  import pyodide_http
  pyodide_http.patch_all()
  import rdflib
  import builtins
  builtins._net_patched = True
            `);
          }
          }
          window.toastr.info("Dependencies loaded");
        } catch (err) {
          console.error("Error loading libs:", err);
          window.toastr.error("Error loading libs");
          window.kgLibsLoading = null;
          throw err;
        }
      })();

      return window.kgLibsLoading;
    }

    async function createKnowledgeGraphTab(ontologyString) {
      try {
        const viewerId = createKgTab(`Knowledge Graph(${knowledgeGraphTabsCount})`);
        knowledgeGraphTabsCount += 1;
        const container = document.getElementById(viewerId);
        if (!container)
          throw new Error(`Container not found: ${viewerId}`);

        const store = parseStore(ontologyString);
        const graphData = buildGraphData(store);
        renderD3Graph(container, graphData);
        attachSparqlQueryHandler(store, container.id);
        addDownloadLink(container, ontologyString)

        console.log("✓ Knowledge Graph rendered");
      } catch (err) {
        console.error("❌ Erro in createKnowledgeGraphTab:", err.message);
        alert(`❌ Erro rendering the graph:\n${err.message}`);
      }
    }

    function attachSparqlQueryHandler(store, containerId) {
      const inputEl = document.getElementById(`${containerId}-sparql-input`);
      const outputEl = document.getElementById(`${containerId}-sparql-output`);
      const runQueryButton = document.getElementById(`${containerId}-sparql-run`);
      const clearResultsButton = document.getElementById(`${containerId}-sparql-clear`);

      runQueryButton.addEventListener('click', () => executeSparqlQuery(store, inputEl, outputEl));
      clearResultsButton.addEventListener('click', () => { outputEl.textContent = ""; });
    }

    async function runComunicaQueryEngine(rdflibStore, queryString, abortSignal) {
      const n3store = new window.N3.Store();
      
      rdflibStore.statements.forEach(st => {
        n3store.addQuad(st.subject, st.predicate, st.object);
      })
      
      const engine = new window.Comunica.QueryEngine();
      const result = await engine.query(queryString, {
        sources: [ n3store ],
        lenient: true,         
        signal: abortSignal
      });

      const resultStream = await engine.resultToString(result);
      return await streamToJson(resultStream.data);
    }

    async function streamToJson(stream) {
      return new Promise((resolve, reject) => { 
        let result = '';  
        stream.on('data', (chunk) => {
          result += new TextDecoder().decode(chunk);
        });
        
        stream.on('end', () => resolve(JSON.parse(result)));
        stream.on('error', reject);
      });
    }
    
    function executeSparqlQuery(store, inputEl, outputEl) {
      const queryString = inputEl.value.trim();
      outputEl.textContent = "";

      if (!queryString) {
        outputEl.textContent = "Please enter a SPARQL query.";
        return;
      }

      const abortController = new AbortController();
      const timeout  = setTimeout(() => abortController.abort(), 20000); // 20s

      outputEl.textContent = "Running query…";

      runComunicaQueryEngine(store, queryString, abortController.signal)
      .then(rows => {
        clearTimeout(timeout);
        if (!rows || rows.length === 0) {
          outputEl.textContent = "No results";
          return;
        }
        outputEl.textContent = JSON.stringify(rows, null, 2);
      })
      .catch(err => {
        clearTimeout(timeout);
        outputEl.textContent = "Error executing the query: " + (err && err.message ? err.message : String(err));
      });
    }

    function parseStore(ontologyString) {
      const store = window.$rdf.graph();
      window.$rdf.parse(ontologyString, store, "https://purl.org/ai4s/ontology/planning#", "application/rdf+xml");
      return store;
    }

    function buildGraphData(store) {
      const classMap = new Map();
      const labelsMap = new Map();
      let domainInstance = null;

      store.statements.forEach(st => {
        if (st.predicate.value === RDF_LABEL_PREDICATE && st.object.termType === "Literal") {
          labelsMap.set(st.subject.value, st.object.value);
          return;
        }
        if (st.predicate.value === RDF_TYPE_PREDICATE && st.object.termType === "NamedNode") {
          const subj = st.subject.value;
          const typeLabel = shortLabel(st.object.value).toLowerCase();
          classMap.set(subj, typeLabel);
          if (typeLabel === "domain") domainInstance = subj;
        }
      });

      const nodes = [];
      const links = [];
      const nodeMap = new Map();

      function ensureNode(uri) {
        if (nodeMap.has(uri)) return nodeMap.get(uri);
        const node = {
          id: uri,
          label: labelsMap.get(uri) || shortLabel(uri),
          class: detectClass(uri, classMap, domainInstance)
        };
        nodes.push(node);
        nodeMap.set(uri, node);
        return node;
      }

      store.statements.forEach(st => {
        if (RDF_IGNORE_PREDICATES.includes(st.predicate.value)) return;
        if (st.object.termType === "Literal") return;
        if (st.subject.termType !== "NamedNode" || st.predicate.termType !== "NamedNode" || st.object.termType !== "NamedNode") return;

        const subj = st.subject.value;
        const pred = st.predicate.value;
        const obj  = st.object.value;

        ensureNode(subj);
        ensureNode(obj);

        links.push({
          id: `${subj}-${pred}-${obj}`,
          source: subj,
          target: obj,
          label: shortLabel(pred)
        });
      });

      return { nodes, links };
    }

    function shortLabel(uri) {
      return uri ? uri.split(/[#\/]/).pop() : "";
    }

    function detectClass(uri, classMap, domainInstance) {
      if (!uri)
        return "other";

      if (uri === domainInstance)
        return "domain";

      const type = classMap.get(uri);
      return (type && ["problem", "action", "parameter", "effect", "precondition", "planner"].includes(type)) ? type : "other";
    }

    function renderD3Graph(container, graphData) {
      const svg = window.d3.select(`#${container.id}-svg`);
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Clear previous content
      svg.selectAll("*").remove();

      // Create arrow marker for edges
      svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 35)
        .attr("refY", 0)
        .attr("orient", "auto")
        .attr("markerWidth", D3_STYLE.edge.markerSize)
        .attr("markerHeight", D3_STYLE.edge.markerSize)
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", D3_STYLE.edge.stroke);

      // Create zoom behavior
      const zoom = window.d3.zoom()
        .scaleExtent([0.2, 4])
        .on("zoom", function(event) {
          g.attr("transform", event.transform);
        });

      svg.call(zoom);

      // Main group for zooming/panning
      const g = svg.append("g");

      // Create force simulation
      const simulation = window.d3.forceSimulation(graphData.nodes)
        .force("charge", window.d3.forceManyBody().strength(-300))
        .force("link", window.d3.forceLink(graphData.links).id(d => d.id)
        .distance(200)).force("center", window.d3.forceCenter(width / 2, height / 2))
        .force("collision", window.d3.forceCollide().radius(30));
      
      // Create links
      const link = g.append("g")
        .selectAll("line")
        .data(graphData.links)
        .enter().append("line")
        .attr("stroke", D3_STYLE.edge.stroke)
        .attr("stroke-width", D3_STYLE.edge.strokeWidth)
        .attr("marker-end", "url(#arrowhead)");

      // Create link labels
      const linkLabel = g.append("g")
        .selectAll("text")
        .data(graphData.links)
        .enter().append("text")
        .attr("font-size", "8px")
        .attr("font-family", D3_STYLE.text.fontFamily)
        .attr("fill", D3_STYLE.text.fill)
        .attr("text-anchor", "middle")
        .attr("dy", -5)
        .style("pointer-events", "none")
        .text(d => d.label);

      // Create node groups
      const node = g.append("g")
        .selectAll("g")
        .data(graphData.nodes)
        .enter().append("g")
        .call(window.d3.drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended));

      // Add circles to nodes
      node.append("circle")
        .attr("r", D3_STYLE.node.default.radius)
        .attr("fill", d => {
          const classStyle = D3_STYLE.node.classes[d.class];
          return classStyle ? classStyle.fill : D3_STYLE.node.default.fill;
        })
        .attr("stroke", D3_STYLE.node.default.stroke)
        .attr("stroke-width", D3_STYLE.node.default.strokeWidth);

      // Add labels to nodes
      node.append("text")
        .attr("dx", 0)
        .attr("dy", 35)
        .attr("font-size", D3_STYLE.text.fontSize)
        .attr("font-family", D3_STYLE.text.fontFamily)
        .attr("fill", D3_STYLE.text.fill)
        .attr("text-anchor", "middle")
        .style("pointer-events", "none")
        .text(d => d.label);

      // Add tooltips
      node.append("title")
        .text(d => `${d.label} (${d.class})`);

      // Update positions on simulation tick
      simulation.on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        linkLabel
          .attr("x", d => (d.source.x + d.target.x) / 2)
          .attr("y", d => (d.source.y + d.target.y) / 2);

        node
          .attr("transform", d => `translate(${d.x},${d.y})`);
      });

      // Drag functions
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
    }

    window.fileChooser = fileChooser;
    window.onFilesChosen = onFilesChosen;
    window.createKnowledgeGraphTab = createKnowledgeGraphTab;
    let knowledgeGraphTabsCount = 1;

    return {
      name:        "Planning Ontology",
      author:      "Bernardo Denkvitts, Biplav Srivastava, Bharath Muppasani",
      email:       "bernardoarcari@gmail.com",
      description: "Generate Knowledge Graph and run SPARQL queries",
      
      initialize: function () {
        $('body').append(PLUGIN_MODAL);
        $('#filesChosenBtn').on('click', onFilesChosen);

        window.register_file_chooser('Plugin', {
          showChoice:  fileChooser,
          selectChoice: onFilesChosen
        });

        loadKgLibs().catch(err => console.error('Preload failed (will retry later):', err));
        
        window.add_menu_button(
          'Knowledge Graph', 'PluginBtn', 'glyphicon-leaf',
          "window.fileChooser()"
        );

      },

      disable: function() {
        window.remove_menu_button('PluginBtn');
        window.remove_menu_button('KGBtn');
      },
      save: function () { return {}; },
      
      load: function(settings)  {}
    };
    
  });