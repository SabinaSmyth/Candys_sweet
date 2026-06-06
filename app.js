// SABI - Lógica de la Aplicación y Gestión de Estados

let supabaseClient = null;
let realtimeChannel = null;

let state = {
    raw_materials: [],
    recipes: [],
    recipesViewMode: "grid"
};

// Objeto temporal para la receta que se está editando en el modal
let tempRecipe = {
    name: "",
    extra_expenses: 0,
    margin: 1,
    ingredients: [] // { material_name, quantity }
};

// Variable para saber qué tipo de insumo estamos eligiendo en el picker
let currentPickerType = ""; 

// Palabras clave para clasificar empaques automáticamente
const packagingKeywords = ["caja", "bolsa", "molde", "papel", "taza", "base", "candy", "vasitos", "banda", "pipeta", "tinta", "cinta", "envase", "pack"];

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", async () => {
    loadState();
    setupNavigation();
    setupMobileMenu();
    setupMaterialFormCalcHelper();
    
    // Establecer modo de vista inicial
    setRecipesViewMode(state.recipesViewMode || "grid", false);
    // Llenar datalist de unidades
    populateUnitsDatalist();
    
    // Renders iniciales
    renderDashboard();
    renderMaterialsTable();
    renderRecipesGrid();
    renderCatalogTable();
    
    // Poner fecha de hoy en el listado para imprimir
    document.getElementById("print-date").innerText = `Fecha de emisión: ${new Date().toLocaleDateString()}`;
    
    // PROCESO DE INICIO DE SESIÓN
    const savedUsername = localStorage.getItem("candys_username");
    const savedPassword = localStorage.getItem("candys_password");
    const overlay = document.getElementById("login-overlay");
    
    if (savedUsername) {
        const usernameInput = document.getElementById("login-username");
        if (usernameInput) usernameInput.value = savedUsername;
    }
    
    // Si hay datos en el localStorage, siempre mostrar la opción de ingresar sin conexión por defecto
    if (localStorage.getItem("sabi_data")) {
        const offlineContainer = document.getElementById("offline-login-container");
        if (offlineContainer) offlineContainer.style.display = "block";
    }
    
    if (savedUsername && savedPassword) {
        if (overlay) overlay.style.display = "flex";
        const loggedIn = await attemptLogin(savedUsername, savedPassword, true);
        if (!loggedIn) {
            const pwdInput = document.getElementById("login-password");
            if (pwdInput) pwdInput.value = savedPassword;
        }
    } else {
        if (overlay) overlay.style.display = "flex";
    }
});

// CARGA Y GUARDADO DE ESTADOS
function loadState() {
    const savedData = localStorage.getItem("sabi_data");
    if (savedData) {
        try {
            state = JSON.parse(savedData);
        } catch (e) {
            console.error("Error cargando datos de LocalStorage. Cargando estado vacío.", e);
            state = { raw_materials: [], recipes: [], recipesViewMode: "grid" };
        }
    } else {
        state = { raw_materials: [], recipes: [], recipesViewMode: "grid" };
    }
    
    if (!state.recipesViewMode) {
        state.recipesViewMode = "grid";
    }
    
    // Clasificar materiales viejos si no tienen categoría o re-calcular costos unitarios
    state.raw_materials.forEach(m => {
        if (!m.category) {
            const nameLower = m.name.toLowerCase();
            const isPackaging = m.unit === "UNIDADES" && packagingKeywords.some(keyword => nameLower.includes(keyword));
            m.category = isPackaging ? "Packaging" : "Ingrediente";
        }
        // Asegurar que el costo unitario esté actualizado
        m.unit_cost = calculateUnitCost(m);
    });
    
    saveState();
}

function saveState() {
    localStorage.setItem("sabi_data", JSON.stringify(state));
}

// FORMATOS Y REDONDEOS
function formatQty(qty) {
    if (qty === undefined || qty === null) return "";
    const parsed = parseFloat(qty);
    if (isNaN(parsed)) return "";
    // Redondear a un máximo de 2 decimales para la cocina, eliminando decimales de más si son innecesarios
    return parseFloat(parsed.toFixed(2));
}

function formatUnitCost(cost) {
    if (cost === undefined || cost === null) return "0.00";
    const parsed = parseFloat(cost);
    if (isNaN(parsed) || parsed === 0) return "0.00";
    
    if (parsed >= 10) {
        return parsed.toFixed(2);
    } else if (parsed >= 1) {
        return parsed.toFixed(3);
    } else {
        return parsed.toFixed(4);
    }
}

// CÁLCULOS GENERALES
function calculateUnitCost(material) {
    const size = parseFloat(material.package_size) || 1;
    const cost = parseFloat(material.package_cost) || 0;
    
    if (material.unit === "KILOS" || material.unit === "LITROS") {
        // Dividido por 1000 para obtener costo por gramo o mililitro
        return cost / (size * 1000);
    } else {
        // Costo por unidad
        return cost / size;
    }
}

// Obtener costo unitario de un material por su nombre
function getMaterialUnitCostByName(name) {
    const mat = state.raw_materials.find(m => m.name.toUpperCase() === name.toUpperCase());
    return mat ? mat.unit_cost : 0;
}

// Obtener detalles completos de un material por su nombre
function getMaterialByName(name) {
    return state.raw_materials.find(m => m.name.toUpperCase() === name.toUpperCase());
}

// Calcular costos detallados de receta
function getRecipeDetails(recipe) {
    let ingredientsCost = 0;
    let packagingCost = 0;
    
    recipe.ingredients.forEach(item => {
        const mat = getMaterialByName(item.material_name);
        if (mat) {
            const cost = item.quantity * mat.unit_cost;
            if (mat.category === "Packaging") {
                packagingCost += cost;
            } else {
                ingredientsCost += cost;
            }
        }
    });
    
    const baseCost = ingredientsCost + packagingCost;
    const extra = parseFloat(recipe.extra_expenses) || 0;
    const margin = parseFloat(recipe.margin) || 0;
    
    // Fórmula: (Costo Base + Extras) * (1 + Rentabilidad)
    const finalPrice = (baseCost + extra) * (1 + margin);
    const netProfit = finalPrice - baseCost - extra;
    
    return {
        ingredientsCost,
        packagingCost,
        baseCost,
        extra,
        finalPrice,
        netProfit
    };
}

// NAVEGACIÓN
function setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetTab = item.getAttribute("data-tab");
            switchTab(targetTab);
            
            // Cerrar sidebar en móviles tras hacer clic
            document.getElementById("sidebar").classList.remove("active");
        });
    });
}

function switchTab(tabId) {
    // Desactivar todos los botones e indicadores
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));
    
    // Activar el correspondiente
    const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    
    const activePanel = document.getElementById(tabId);
    if (activePanel) activePanel.classList.add("active");
    
    // Re-renderizar la pestaña que se activa por si hubo cambios
    if (tabId === "dashboard-tab") renderDashboard();
    else if (tabId === "stock-tab") renderMaterialsTable();
    else if (tabId === "recipes-tab") renderRecipesGrid();
    else if (tabId === "catalog-tab") renderCatalogTable();
}

function setupMobileMenu() {
    const toggleBtn = document.getElementById("menu-toggle");
    const sidebar = document.getElementById("sidebar");
    
    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("active");
    });
    
    // Cerrar sidebar al hacer clic fuera en móviles
    document.addEventListener("click", (e) => {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target) && sidebar.classList.contains("active")) {
            sidebar.classList.remove("active");
        }
    });
}

// TOAST NOTIFICATIONS
function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.style.display = "block";
    if (type === "error") {
        toast.style.backgroundColor = "var(--danger)";
    } else {
        toast.style.backgroundColor = "#111827";
    }
    
    setTimeout(() => {
        toast.style.display = "none";
    }, 3000);
}

// ================= RENDERS =================

// DASHBOARD
function renderDashboard() {
    document.getElementById("stat-total-materials").innerText = state.raw_materials.length;
    document.getElementById("stat-total-recipes").innerText = state.recipes.length;
    
    // Calcular costo promedio de recetas
    let totalBaseCost = 0;
    state.recipes.forEach(r => {
        totalBaseCost += getRecipeDetails(r).baseCost;
    });
    const avgCost = state.recipes.length > 0 ? totalBaseCost / state.recipes.length : 0;
    document.getElementById("stat-avg-cost").innerText = `$${avgCost.toFixed(2)}`;
    
    // Insumos más caros
    const sortedMaterials = [...state.raw_materials]
        .sort((a, b) => b.package_cost - a.package_cost)
        .slice(0, 5);
        
    const listContainer = document.getElementById("top-expensive-materials");
    listContainer.innerHTML = "";
    sortedMaterials.forEach(m => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span class="name">${m.name}</span>
            <span class="price">$${m.package_cost.toFixed(2)} <small style="color:var(--text-muted)">/${formatQty(m.package_size)} ${m.unit.toLowerCase()}</small></span>
        `;
        listContainer.appendChild(li);
    });
}

// STOCK / MATERIAS PRIMAS
function renderMaterialsTable(filtered = null) {
    const list = filtered || state.raw_materials;
    // Ordenar alfabéticamente por nombre
    list.sort((a, b) => a.name.localeCompare(b.name));
    
    const tbody = document.getElementById("materials-table-body");
    tbody.innerHTML = "";
    
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: 30px;">No se encontraron insumos.</td></tr>`;
        return;
    }
    
    list.forEach(m => {
        const tr = document.createElement("tr");
        const unitLabel = m.unit === "KILOS" ? "gramo" : m.unit === "LITROS" ? "ml" : "unidad";
        const unitSymbol = m.unit === "KILOS" ? "gr" : m.unit === "LITROS" ? "ml" : "u";
        
        tr.innerHTML = `
            <td style="font-weight:600">${m.name}</td>
            <td><span class="category-tag ${m.category.toLowerCase()}">${m.category}</span></td>
            <td>${m.unit}</td>
            <td>${formatQty(m.package_size)}</td>
            <td style="font-weight:500">$${parseFloat(m.package_cost).toFixed(2)}</td>
            <td style="color: var(--primary); font-weight:700">$${formatUnitCost(m.unit_cost)} <small style="color:var(--text-muted)">/ ${unitSymbol}</small></td>
            <td class="action-links">
                <button class="action-link-btn" onclick="openMaterialModal('${m.name.replace(/'/g, "\\'")}')">Editar</button>
                <button class="action-link-btn delete-link" onclick="deleteMaterial('${m.name.replace(/'/g, "\\'")}')">Borrar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterMaterials() {
    const query = document.getElementById("search-materials").value.toLowerCase();
    const category = document.getElementById("filter-material-category").value;
    
    const filtered = state.raw_materials.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(query);
        const matchesCategory = category === "all" || m.category === category;
        return matchesSearch && matchesCategory;
    });
    
    renderMaterialsTable(filtered);
}

// RECETAS (FICHAS)
function renderRecipesGrid(filtered = null) {
    const list = filtered || state.recipes;
    list.sort((a, b) => a.name.localeCompare(b.name));
    
    const grid = document.getElementById("recipes-grid");
    grid.innerHTML = "";
    
    if (list.length === 0) {
        grid.innerHTML = `<div class="text-center" style="grid-column: 1/-1; color: var(--text-muted); padding: 40px;">No se encontraron recetas de productos.</div>`;
        return;
    }
    
    const viewMode = state.recipesViewMode || "grid";
    
    list.forEach(r => {
        const details = getRecipeDetails(r);
        const card = document.createElement("div");
        card.className = "recipe-card";
        
        // Contar cuántos ingredientes y packaging
        let ingCount = 0;
        let packCount = 0;
        r.ingredients.forEach(item => {
            const mat = getMaterialByName(item.material_name);
            if (mat) {
                if (mat.category === "Packaging") packCount++;
                else ingCount++;
            }
        });
        
        // Obtener el índice original en el array para editar
        const origIndex = state.recipes.findIndex(recipe => recipe.name === r.name);
        card.setAttribute("onclick", `openRecipeModal(${origIndex})`);
        
        if (viewMode === "list") {
            // Modo Lista: Filas horizontales muy compactas, sin fotos y sin listas de ingredientes largas
            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; flex:2; min-width:180px; overflow:hidden;">
                    <div class="recipe-card-thumb-container">
                        <div class="recipe-card-thumb-placeholder" style="font-size:12px;">🍳</div>
                    </div>
                    <h3 style="font-size:14px; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${r.name}</h3>
                </div>
                <div class="recipe-card-meta">
                    <div class="meta-row">
                        <span class="lbl" style="font-size:11px;">Insumos:</span>
                        <span class="val" style="font-size:12px;">${ingCount + packCount} items</span>
                    </div>
                    <div class="meta-row hide-client-print">
                        <span class="lbl" style="font-size:11px;">Costo Base:</span>
                        <span class="val" style="font-size:12px;">$${details.baseCost.toFixed(2)}</span>
                    </div>
                    <div class="meta-row total-price">
                        <span class="lbl" style="font-size:11px; margin-right:4px;">Precio:</span>
                        <span class="val" style="color:var(--primary); font-weight:700; font-size:14px;">$${details.finalPrice.toFixed(2)}</span>
                    </div>
                </div>
            `;
        } else if (viewMode === "large") {
            // Modo Detalle Grande: Tarjetas expandidas que listan todos los ingredientes y packaging con cantidades y costos en pantalla
            let itemsListHtml = "";
            r.ingredients.forEach(item => {
                const mat = getMaterialByName(item.material_name);
                if (mat) {
                    const cost = item.quantity * mat.unit_cost;
                    const unitSymbol = mat.unit === "KILOS" ? "gr" : mat.unit === "LITROS" ? "ml" : "u";
                    itemsListHtml += `<li><span>${item.material_name} <small style="color:var(--text-muted)">(${formatQty(item.quantity)}${unitSymbol})</small></span> <span class="qty">$${cost.toFixed(2)}</span></li>`;
                }
            });
            
            if (!itemsListHtml) {
                itemsListHtml = `<li style="color:var(--text-muted); text-align:center;">Sin insumos cargados</li>`;
            }
            
            let imgHtml = "";
            if (r.image) {
                imgHtml = `
                    <div class="recipe-card-grid-img-container" style="height:150px;">
                        <img src="${r.image}" class="recipe-card-grid-img" alt="${r.name}">
                    </div>
                `;
            } else {
                imgHtml = `
                    <div class="recipe-card-grid-img-container" style="height: 60px;">
                        <div class="recipe-card-grid-img-placeholder" style="font-size: 20px;">🍳</div>
                    </div>
                `;
            }
            
            card.innerHTML = `
                ${imgHtml}
                <h3 style="font-size:18px;">${r.name}</h3>
                
                <div class="recipe-card-details-box">
                    <h4>Ingredientes y Packaging</h4>
                    <ul>
                        ${itemsListHtml}
                    </ul>
                </div>
                
                <div class="recipe-card-meta" style="margin-top:auto; padding-top:12px; border-top:1px dashed var(--border-color);">
                    <div class="meta-row hide-client-print">
                        <span class="lbl">Costo Base:</span>
                        <span class="val">$${details.baseCost.toFixed(2)}</span>
                    </div>
                    <div class="meta-row hide-client-print">
                        <span class="lbl">Gastos Extra:</span>
                        <span class="val">$${details.extra.toFixed(2)}</span>
                    </div>
                    <div class="meta-row hide-client-print">
                        <span class="lbl">Rendimiento:</span>
                        <span class="val">x${(1 + r.margin).toFixed(2)}</span>
                    </div>
                    <div class="meta-row total-price" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);">
                        <span class="lbl" style="font-size:13px; font-weight:700;">Precio Sugerido:</span>
                        <span class="val" style="font-size:18px; color:var(--primary); font-weight:700;">$${details.finalPrice.toFixed(2)}</span>
                    </div>
                </div>
            `;
        } else {
            // Modo Cuadrícula Estándar (Por defecto)
            let imgHtml = "";
            if (r.image) {
                imgHtml = `
                    <div class="recipe-card-grid-img-container">
                        <img src="${r.image}" class="recipe-card-grid-img" alt="${r.name}">
                    </div>
                `;
            } else {
                imgHtml = `
                    <div class="recipe-card-grid-img-container" style="height: 60px;">
                        <div class="recipe-card-grid-img-placeholder" style="font-size: 20px;">🍳</div>
                    </div>
                `;
            }
            
            card.innerHTML = `
                ${imgHtml}
                <h3>${r.name}</h3>
                <div class="recipe-card-meta">
                    <div class="meta-row">
                        <span class="lbl">Ingredientes:</span>
                        <span class="val">${ingCount} items</span>
                    </div>
                    <div class="meta-row">
                        <span class="lbl">Packaging:</span>
                        <span class="val">${packCount} items</span>
                    </div>
                    <div class="meta-row">
                        <span class="lbl">Costo Base:</span>
                        <span class="val">$${details.baseCost.toFixed(2)}</span>
                    </div>
                    <div class="meta-row">
                        <span class="lbl">Rendimiento:</span>
                        <span class="val">x${(1 + r.margin).toFixed(2)}</span>
                    </div>
                    <div class="meta-row total-price">
                        <span class="lbl">Precio Venta:</span>
                        <span class="val">$${details.finalPrice.toFixed(2)}</span>
                    </div>
                </div>
            `;
        }
        grid.appendChild(card);
    });
}

function filterRecipes() {
    const query = document.getElementById("search-recipes").value.toLowerCase();
    const filtered = state.recipes.filter(r => r.name.toLowerCase().includes(query));
    renderRecipesGrid(filtered);
}

// CATÁLOGO / LISTADO DE VENTAS
function renderCatalogTable(filtered = null) {
    const list = filtered || state.recipes;
    list.sort((a, b) => a.name.localeCompare(b.name));
    
    const tbody = document.getElementById("catalog-table-body");
    tbody.innerHTML = "";
    
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: 30px;">No hay productos finales para mostrar.</td></tr>`;
        return;
    }
    
    list.forEach(r => {
        const d = getRecipeDetails(r);
        const tr = document.createElement("tr");
        
        tr.innerHTML = `
            <td style="font-weight:700; font-size:15px;">${r.name}</td>
            <td class="text-right hide-client-print">$${d.ingredientsCost.toFixed(2)}</td>
            <td class="text-right hide-client-print">$${d.packagingCost.toFixed(2)}</td>
            <td class="text-right hide-client-print" style="font-weight:500;">$${d.baseCost.toFixed(2)}</td>
            <td class="text-right hide-client-print">x${(1 + r.margin).toFixed(2)}</td>
            <td class="text-right highlight-header" style="font-size:16px; font-weight:800;">$${d.finalPrice.toFixed(2)}</td>
            <td class="text-right text-success no-print hide-client-print" style="font-weight:700;">$${d.netProfit.toFixed(2)}</td>
            <td class="text-center no-print">
                <button class="btn-whatsapp-icon" onclick="shareProductWhatsApp('${r.name.replace(/'/g, "\\'")}', ${d.finalPrice})" title="Compartir precio por WhatsApp">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterCatalog() {
    const query = document.getElementById("search-catalog").value.toLowerCase();
    const filtered = state.recipes.filter(r => r.name.toLowerCase().includes(query));
    renderCatalogTable(filtered);
}


// ================= FORMULARIOS Y MODALES =================

// MODAL MATERIALES (STOCK)
function openMaterialModal(materialName = "") {
    const form = document.getElementById("material-form");
    form.reset();
    
    const titleEl = document.getElementById("material-modal-title");
    const previewEl = document.getElementById("material-calc-preview");
    
    if (materialName) {
        titleEl.innerText = "Editar Insumo";
        const m = state.raw_materials.find(mat => mat.name === materialName);
        if (m) {
            document.getElementById("edit-material-original-name").value = m.name;
            document.getElementById("material-name").value = m.name;
            document.getElementById("material-category").value = m.category;
            document.getElementById("material-unit").value = m.unit;
            document.getElementById("material-package-size").value = m.package_size;
            document.getElementById("material-package-cost").value = m.package_cost;
            
            updateMaterialCalcPreview();
        }
    } else {
        titleEl.innerText = "Agregar Insumo";
        document.getElementById("edit-material-original-name").value = "";
        previewEl.innerHTML = "Costo unitario calculado: <strong>$0.00</strong> por gramo/unidad.";
    }
    
    document.getElementById("material-modal").classList.add("active");
}

function closeMaterialModal() {
    document.getElementById("material-modal").classList.remove("active");
}

function setupMaterialFormCalcHelper() {
    const inputs = ["material-unit", "material-package-size", "material-package-cost"];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener("input", updateMaterialCalcPreview);
        document.getElementById(id).addEventListener("change", updateMaterialCalcPreview);
    });
}

function updateMaterialCalcPreview() {
    const unit = document.getElementById("material-unit").value;
    const size = parseFloat(document.getElementById("material-package-size").value) || 1;
    const cost = parseFloat(document.getElementById("material-package-cost").value) || 0;
    
    const tempMaterial = { unit, package_size: size, package_cost: cost };
    const unitCost = calculateUnitCost(tempMaterial);
    
    const unitLabel = unit === "KILOS" ? "gramo" : unit === "LITROS" ? "ml" : "unidad";
    const previewEl = document.getElementById("material-calc-preview");
    previewEl.innerHTML = `Costo unitario calculado: <strong>$${formatUnitCost(unitCost)}</strong> por ${unitLabel}.`;
}

function saveMaterialForm(event) {
    event.preventDefault();
    
    const originalName = document.getElementById("edit-material-original-name").value;
    const name = document.getElementById("material-name").value.trim().toUpperCase();
    const category = document.getElementById("material-category").value;
    const unit = document.getElementById("material-unit").value;
    const size = parseFloat(document.getElementById("material-package-size").value) || 1;
    const cost = parseFloat(document.getElementById("material-package-cost").value) || 0;
    
    // Validar nombre único si es nuevo o si cambió de nombre
    if (name !== originalName.toUpperCase()) {
        const exists = state.raw_materials.some(m => m.name.toUpperCase() === name);
        if (exists) {
            alert("Ya existe un insumo con este nombre. Elige otro nombre.");
            return;
        }
    }
    
    const updatedMaterial = {
        name,
        category,
        unit,
        package_size: size,
        package_cost: cost,
        unit_cost: 0 // Se calcula abajo
    };
    updatedMaterial.unit_cost = calculateUnitCost(updatedMaterial);
    
    if (originalName) {
        // Modo Edición
        const idx = state.raw_materials.findIndex(m => m.name === originalName);
        if (idx !== -1) {
            state.raw_materials[idx] = updatedMaterial;
            
            // Si el nombre cambió, actualizarlo también en las recetas que lo usen
            if (name !== originalName.toUpperCase()) {
                state.recipes.forEach(r => {
                    r.ingredients.forEach(item => {
                        if (item.material_name.toUpperCase() === originalName.toUpperCase()) {
                            item.material_name = name;
                        }
                    });
                });
            }
            showToast("Insumo actualizado correctamente.");
        }
    } else {
        // Modo Nuevo
        state.raw_materials.push(updatedMaterial);
        showToast("Insumo agregado correctamente.");
    }
    
    saveState();
    
    // Sincronizar con la nube
    saveMaterialToCloud(updatedMaterial, originalName);
    
    closeMaterialModal();
    
    // Actualizar unidades de datalist
    populateUnitsDatalist();
    
    // Actualizar vistas afectadas
    renderDashboard();
    renderMaterialsTable();
    // Re-render recetas también porque el costo de un insumo cambió
    renderRecipesGrid();
    renderCatalogTable();
}

function deleteMaterial(name) {
    if (confirm(`¿Estás seguro de que quieres eliminar el insumo "${name}"? Esto afectará a las recetas que lo utilicen.`)) {
        state.raw_materials = state.raw_materials.filter(m => m.name !== name);
        
        // Quitar de las recetas
        state.recipes.forEach(r => {
            r.ingredients = r.ingredients.filter(item => item.material_name !== name);
        });
        
        saveState();
        
        // Sincronizar con la nube
        deleteMaterialFromCloud(name);
        
        showToast("Insumo eliminado.");
        
        // Actualizar unidades
        populateUnitsDatalist();
        
        renderDashboard();
        renderMaterialsTable();
        renderRecipesGrid();
        renderCatalogTable();
    }
}


// MODAL RECETAS (FICHAS)
function openRecipeModal(index = -1) {
    const titleEl = document.getElementById("recipe-modal-title");
    const deleteBtn = document.getElementById("btn-delete-recipe");
    
    if (index >= 0) {
        titleEl.innerText = "Ficha Técnica y Edición";
        deleteBtn.style.display = "block";
        
        // Copiar receta del estado para editar
        const originalRecipe = state.recipes[index];
        tempRecipe = JSON.parse(JSON.stringify(originalRecipe));
        document.getElementById("edit-recipe-index").value = index;
    } else {
        titleEl.innerText = "Nueva Receta de Producto";
        deleteBtn.style.display = "none";
        
        // Receta temporal vacía
        tempRecipe = {
            name: "",
            extra_expenses: 0,
            margin: 1.5, // 1.5 por defecto
            ingredients: []
        };
        document.getElementById("edit-recipe-index").value = -1;
    }
    
    // Cargar datos en el modal
    document.getElementById("recipe-name").value = tempRecipe.name;
    document.getElementById("recipe-margin").value = tempRecipe.margin;
    document.getElementById("recipe-extra-expenses").value = tempRecipe.extra_expenses;
    
    // Cargar imagen de vista previa
    const imgInput = document.getElementById("recipe-image-input");
    if (imgInput) imgInput.value = "";
    
    const preview = document.getElementById("recipe-modal-image-preview");
    const placeholder = document.getElementById("recipe-modal-image-placeholder");
    const removeBtn = document.getElementById("btn-remove-recipe-image");
    if (tempRecipe.image) {
        preview.src = tempRecipe.image;
        preview.style.display = "block";
        placeholder.style.display = "none";
        if (removeBtn) removeBtn.style.display = "inline-block";
    } else {
        preview.src = "";
        preview.style.display = "none";
        placeholder.style.display = "flex";
        if (removeBtn) removeBtn.style.display = "none";
    }
    
    recalcModalRecipe();
    document.getElementById("recipe-modal").classList.add("active");
}

function openNewRecipeModal() {
    openRecipeModal(-1);
}

function closeRecipeModal() {
    document.getElementById("recipe-modal").classList.remove("active");
}

// Recalcular costos y redibujar tablas en caliente dentro del modal
function recalcModalRecipe() {
    // Leer valores básicos en tiempo real
    tempRecipe.name = document.getElementById("recipe-name").value;
    tempRecipe.margin = parseFloat(document.getElementById("recipe-margin").value) || 0;
    tempRecipe.extra_expenses = parseFloat(document.getElementById("recipe-extra-expenses").value) || 0;
    
    const tbodyIng = document.getElementById("recipe-ingredients-body");
    const tbodyPack = document.getElementById("recipe-packaging-body");
    
    tbodyIng.innerHTML = "";
    tbodyPack.innerHTML = "";
    
    let subtotalIng = 0;
    let subtotalPack = 0;
    
    tempRecipe.ingredients.forEach((item, index) => {
        const mat = getMaterialByName(item.material_name);
        if (!mat) return;
        
        const cost = item.quantity * mat.unit_cost;
        const unitSymbol = mat.unit === "KILOS" ? "gr" : mat.unit === "LITROS" ? "ml" : "u";
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:600">${item.material_name}</td>
            <td class="text-right">
                <input type="number" step="any" class="mini-qty-input" value="${formatQty(item.quantity)}" oninput="updateRecipeItemQty(${index}, this.value)">
            </td>
            <td style="color:var(--text-muted)">${unitSymbol}</td>
            <td class="text-right">$${cost.toFixed(2)}</td>
            <td class="text-center">
                <button type="button" class="action-link-btn delete-link" onclick="removeRecipeItem(${index})" style="font-size:16px;">&times;</button>
            </td>
        `;
        
        if (mat.category === "Packaging") {
            tbodyPack.appendChild(tr);
            subtotalPack += cost;
        } else {
            tbodyIng.appendChild(tr);
            subtotalIng += cost;
        }
    });
    
    // Validar tablas vacías
    if (tbodyIng.children.length === 0) {
        tbodyIng.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); font-size:12px; padding:15px;">Ningún ingrediente añadido.</td></tr>`;
    }
    if (tbodyPack.children.length === 0) {
        tbodyPack.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); font-size:12px; padding:15px;">Ningún packaging añadido.</td></tr>`;
    }
    
    // Totales
    document.getElementById("subtotal-ingredients").innerText = `$${subtotalIng.toFixed(2)}`;
    document.getElementById("subtotal-packaging").innerText = `$${subtotalPack.toFixed(2)}`;
    
    const baseCost = subtotalIng + subtotalPack;
    const extra = tempRecipe.extra_expenses;
    const finalPrice = (baseCost + extra) * (1 + tempRecipe.margin);
    const netProfit = finalPrice - baseCost - extra;
    
    document.getElementById("summary-base-cost").innerText = `$${baseCost.toFixed(2)}`;
    document.getElementById("summary-extra-expenses").innerText = `$${extra.toFixed(2)}`;
    document.getElementById("summary-final-price").innerText = `$${finalPrice.toFixed(2)}`;
    document.getElementById("summary-net-profit").innerText = `$${netProfit.toFixed(2)}`;
}

// Actualizar cantidad de un insumo dentro del modal directamente
function updateRecipeItemQty(index, val) {
    const qty = parseFloat(val) || 0;
    tempRecipe.ingredients[index].quantity = qty;
    recalcModalRecipe();
}

// Remover insumo de la receta en el modal
function removeRecipeItem(index) {
    tempRecipe.ingredients.splice(index, 1);
    recalcModalRecipe();
}

// Abrir Selector de Insumos (Picker)
function openItemPicker(type) {
    currentPickerType = type; // "Ingrediente" o "Packaging"
    document.getElementById("item-picker-title").innerText = `Añadir ${type}`;
    document.getElementById("search-picker-items").value = "";
    document.getElementById("picker-qty-container").style.display = "none";
    
    filterPickerItems();
    document.getElementById("item-picker-modal").classList.add("active");
}

function closeItemPicker() {
    document.getElementById("item-picker-modal").classList.remove("active");
}

// Filtrar lista del picker
function filterPickerItems() {
    const query = document.getElementById("search-picker-items").value.toLowerCase();
    const listEl = document.getElementById("picker-items-list");
    listEl.innerHTML = "";
    
    // Filtrar materiales de stock por categoría y buscador
    const filtered = state.raw_materials.filter(m => {
        const matchesCategory = m.category === currentPickerType;
        const matchesSearch = m.name.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
    });
    
    if (filtered.length === 0) {
        listEl.innerHTML = `<li class="text-center" style="padding:15px; color:var(--text-muted); font-size:13px;">No se encontraron insumos de este tipo.</li>`;
        return;
    }
    
    // Ordenar alfabéticamente
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    
    filtered.forEach(m => {
        const li = document.createElement("li");
        li.className = "picker-item";
        li.innerText = m.name;
        li.setAttribute("onclick", `selectPickerItem('${m.name.replace(/'/g, "\\'")}', this)`);
        listEl.appendChild(li);
    });
}

let selectedPickerItemName = "";

function selectPickerItem(name, element) {
    selectedPickerItemName = name;
    
    // Desmarcar otros
    document.querySelectorAll(".picker-item").forEach(el => el.classList.remove("selected"));
    element.classList.add("selected");
    
    const mat = getMaterialByName(name);
    if (mat) {
        const qtyContainer = document.getElementById("picker-qty-container");
        const qtyInput = document.getElementById("picker-item-qty");
        const unitLabel = document.getElementById("picker-unit-label");
        const calcHelper = document.getElementById("picker-calc-helper");
        
        qtyInput.value = "";
        
        let unitText = "unidad";
        if (mat.unit === "KILOS") unitText = "gramo";
        else if (mat.unit === "LITROS") unitText = "ml";
        
        unitLabel.innerText = mat.unit === "KILOS" ? "gr" : mat.unit === "LITROS" ? "ml" : "u";
        calcHelper.innerText = `Costo por ${unitText}: $${formatUnitCost(mat.unit_cost)}`;
        
        qtyContainer.style.display = "block";
        qtyInput.focus();
    }
}

// Confirmar selección del picker y añadir a la receta temporal
function confirmItemPick() {
    const qty = parseFloat(document.getElementById("picker-item-qty").value) || 0;
    if (qty <= 0) {
        alert("La cantidad debe ser mayor a 0.");
        return;
    }
    
    // Validar si ya existe en la receta temporal
    const exists = tempRecipe.ingredients.some(item => item.material_name.toUpperCase() === selectedPickerItemName.toUpperCase());
    if (exists) {
        if (confirm(`El insumo "${selectedPickerItemName}" ya está en la receta. ¿Deseas sumar esta cantidad a la existente?`)) {
            const item = tempRecipe.ingredients.find(item => item.material_name.toUpperCase() === selectedPickerItemName.toUpperCase());
            item.quantity += qty;
        }
    } else {
        tempRecipe.ingredients.push({
            material_name: selectedPickerItemName,
            quantity: qty
        });
    }
    
    closeItemPicker();
    recalcModalRecipe();
}

// Guardar receta desde el modal al estado
function saveRecipeForm() {
    const name = document.getElementById("recipe-name").value.trim().toUpperCase();
    const margin = parseFloat(document.getElementById("recipe-margin").value);
    const extra = parseFloat(document.getElementById("recipe-extra-expenses").value) || 0;
    const index = parseInt(document.getElementById("edit-recipe-index").value);
    
    if (!name) {
        alert("Debes definir un nombre para el producto.");
        return;
    }
    
    if (isNaN(margin) || margin < 0) {
        alert("El rendimiento debe ser un número igual o mayor a 0.");
        return;
    }
    
    tempRecipe.name = name;
    tempRecipe.margin = margin;
    tempRecipe.extra_expenses = extra;
    
    // Validar nombre único
    const duplicateIndex = state.recipes.findIndex(r => r.name.toUpperCase() === name);
    if (duplicateIndex !== -1 && duplicateIndex !== index) {
        alert("Ya existe un producto con este nombre. Por favor, elige otro.");
        return;
    }
    
    let originalName = "";
    if (index >= 0) {
        originalName = state.recipes[index].name;
        // Editar existente
        state.recipes[index] = JSON.parse(JSON.stringify(tempRecipe));
        showToast("Receta actualizada con éxito.");
    } else {
        // Nueva receta
        state.recipes.push(JSON.parse(JSON.stringify(tempRecipe)));
        showToast("Receta agregada con éxito.");
    }
    
    saveState();
    
    // Sincronizar con la nube
    saveRecipeToCloud(tempRecipe, originalName);
    
    closeRecipeModal();
    
    // Renders
    renderDashboard();
    renderRecipesGrid();
    renderCatalogTable();
}

// Eliminar receta
function deleteCurrentRecipe() {
    const index = parseInt(document.getElementById("edit-recipe-index").value);
    if (index >= 0) {
        const recipeName = state.recipes[index].name;
        if (confirm(`¿Estás seguro de que quieres eliminar la receta del producto "${recipeName}"?`)) {
            state.recipes.splice(index, 1);
            saveState();
            
            // Sincronizar con la nube
            deleteRecipeFromCloud(recipeName);
            
            closeRecipeModal();
            showToast("Receta eliminada.");
            
            renderDashboard();
            renderRecipesGrid();
            renderCatalogTable();
        }
    }
}


// ================= COPIAS DE SEGURIDAD =================

function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `sabi_backup_${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showToast("Copia de seguridad descargada.");
}

function importData(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    
    document.getElementById("import-file-name").innerText = file.name;
    
    const reader = new FileReader();
    reader.onload = function() {
        try {
            const parsedData = JSON.parse(reader.result);
            // Validación básica de estructura
            if (parsedData.raw_materials && Array.isArray(parsedData.raw_materials) && parsedData.recipes && Array.isArray(parsedData.recipes)) {
                if (confirm("Se cargarán todos los datos del archivo importado. Se sobrescribirán los datos actuales en este navegador. ¿Deseas continuar?")) {
                    state = parsedData;
                    saveState();
                    showToast("Datos importados con éxito.");
                    // Forzar recarga total de la interfaz
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                }
            } else {
                alert("El archivo de respaldo no tiene el formato correcto.");
            }
        } catch (e) {
            alert("Error leyendo el archivo JSON: " + e.message);
        }
    };
    reader.readAsText(file);
}

// ================= NUEVOS MÉTODOS (FASE 2) =================

// Alimentar el datalist con todas las unidades únicas ingresadas
function populateUnitsDatalist() {
    const datalist = document.getElementById("material-units-list");
    if (!datalist) return;
    
    const defaultUnits = ["KILOS", "LITROS", "UNIDADES"];
    const currentUnits = state.raw_materials.map(m => m.unit.toUpperCase());
    const allUnits = Array.from(new Set([...defaultUnits, ...currentUnits]));
    
    datalist.innerHTML = "";
    allUnits.forEach(u => {
        const option = document.createElement("option");
        option.value = u;
        datalist.appendChild(option);
    });
}

// Imprimir lista de precios limpia para clientes (sin costos ni ganancias)
function printClientCatalog() {
    document.body.classList.add("print-client-only");
    window.print();
    
    // Remover clase al finalizar
    window.addEventListener('afterprint', () => {
        document.body.classList.remove("print-client-only");
    }, { once: true });
    
    setTimeout(() => {
        document.body.classList.remove("print-client-only");
    }, 1500);
}

// Configurar modo de vista de las recetas (Cuadrícula, Lista o Detalle Grande)
function setRecipesViewMode(mode, triggerRender = true) {
    state.recipesViewMode = mode;
    saveState();
    
    const btnGrid = document.getElementById("view-mode-grid");
    const btnList = document.getElementById("view-mode-list");
    const btnLarge = document.getElementById("view-mode-large");
    const grid = document.getElementById("recipes-grid");
    
    if (btnGrid && btnList && btnLarge && grid) {
        // Remover active de todos los botones
        btnGrid.classList.remove("active");
        btnList.classList.remove("active");
        btnLarge.classList.remove("active");
        
        // Limpiar clases de modo de visualización en el grid
        grid.classList.remove("view-list");
        grid.classList.remove("view-large");
        
        if (mode === "list") {
            btnList.classList.add("active");
            grid.classList.add("view-list");
        } else if (mode === "large") {
            btnLarge.classList.add("active");
            grid.classList.add("view-large");
        } else {
            btnGrid.classList.add("active");
        }
    }
    
    if (triggerRender) {
        renderRecipesGrid();
    }
}

// Manejar la carga de imágenes, comprimiéndolas para que quepan en LocalStorage
function handleRecipeImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // Usar Canvas para comprimir la imagen a un tamaño máximo de 250px
            const canvas = document.createElement("canvas");
            const max_size = 250;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > max_size) {
                    height *= max_size / width;
                    width = max_size;
                }
            } else {
                if (height > max_size) {
                    width *= max_size / height;
                    height = max_size;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            
            // Exportar como JPG a calidad media para máximo ahorro de espacio
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            
            tempRecipe.image = dataUrl;
            
            // Actualizar vista previa en el modal
            const preview = document.getElementById("recipe-modal-image-preview");
            const placeholder = document.getElementById("recipe-modal-image-placeholder");
            const removeBtn = document.getElementById("btn-remove-recipe-image");
            preview.src = dataUrl;
            preview.style.display = "block";
            placeholder.style.display = "none";
            if (removeBtn) removeBtn.style.display = "inline-block";
        };
        img.onerror = function() {
            alert("Error al cargar la imagen. Por favor, asegúrate de subir un archivo de imagen válido.");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ================= SISTEMA DE AUTENTICACIÓN (LOGIN) =================

async function attemptLogin(username, password, remember = false) {
    const errorMsg = document.getElementById("login-error-msg");
    const overlay = document.getElementById("login-overlay");
    const btnSubmit = document.getElementById("btn-login-submit");
    
    if (btnSubmit) {
        btnSubmit.innerText = "Conectando...";
        btnSubmit.disabled = true;
    }
    if (errorMsg) errorMsg.style.display = "none";
    
    try {
        const res = await fetch("/api/config", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Usuario o contraseña incorrectos.");
        }
        
        const config = await res.json();
        const url = config.supabaseUrl;
        const key = config.supabaseKey;
        
        if (url && key) {
            if (typeof supabase !== 'undefined') {
                supabaseClient = supabase.createClient(url, key);
                
                // Actualizar UI en pestaña backup
                const statusText = document.getElementById("supabase-status-text");
                const syncBtn = document.getElementById("btn-sync-supabase");
                const logoutBtn = document.getElementById("btn-logout");
                
                if (statusText) {
                    statusText.innerText = "Conectado";
                    statusText.style.color = "var(--success)";
                }
                if (syncBtn) syncBtn.style.display = "inline-flex";
                if (logoutBtn) logoutBtn.style.display = "inline-flex";
                
                // Guardar credenciales en el dispositivo si corresponde
                if (remember) {
                    localStorage.setItem("candys_username", username);
                    localStorage.setItem("candys_password", password);
                }
                
                // Ocultar overlay
                if (overlay) overlay.style.display = "none";
                
                // Sincronizar datos
                await syncWithSupabase();
                
                // Activar suscripción en tiempo real
                setupRealtimeSubscription();
                
                return true;
            } else {
                throw new Error("Librería de Supabase no cargada.");
            }
        } else {
            throw new Error("Base de datos no configurada en Vercel.");
        }
    } catch (err) {
        console.error("Error de login:", err.message);
        if (errorMsg) {
            errorMsg.innerText = err.message || "Error al ingresar. Inténtalo de nuevo.";
            errorMsg.style.display = "block";
        }
        if (overlay) overlay.style.display = "flex";
        
        // Mostrar opción offline si hay error de red o de login
        const offlineContainer = document.getElementById("offline-login-container");
        if (offlineContainer) {
            offlineContainer.style.display = "block";
        }
        
        // Si el login automático falló, no borramos el username pero sí la contraseña
        localStorage.removeItem("candys_password");
        return false;
    } finally {
        if (btnSubmit) {
            btnSubmit.innerText = "Ingresar";
            btnSubmit.disabled = false;
        }
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const remember = document.getElementById("remember-password").checked;
    await attemptLogin(username, password, remember);
}

function toggleLoginPassword() {
    const input = document.getElementById("login-password");
    const toggleBtn = document.getElementById("toggle-login-password");
    if (input.type === "password") {
        input.type = "text";
        toggleBtn.innerText = "🙈";
    } else {
        input.type = "password";
        toggleBtn.innerText = "👁️";
    }
}

function logout() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión? Deberás ingresar el usuario y contraseña nuevamente.")) {
        if (realtimeChannel && supabaseClient) {
            supabaseClient.removeChannel(realtimeChannel);
        }
        localStorage.removeItem("candys_username");
        localStorage.removeItem("candys_password");
        localStorage.removeItem("sabi_data");
        state = { raw_materials: [], recipes: [], recipesViewMode: "grid" };
        window.location.reload();
    }
}

async function syncWithSupabase(showNotification = true) {
    if (!supabaseClient) return false;
    
    try {
        // 1. Obtener insumos
        const { data: materials, error: matError } = await supabaseClient
            .from('raw_materials')
            .select('*');
            
        if (matError) throw matError;
        
        // 2. Obtener recetas con sus relaciones
        const { data: recipes, error: recError } = await supabaseClient
            .from('recipes')
            .select('*, recipe_ingredients(*, raw_materials(name))');
            
        if (recError) throw recError;
        
        // Formatear insumos
        const formattedMaterials = materials.map(m => ({
            id: m.id,
            name: m.name,
            category: m.category,
            unit: m.unit,
            package_size: parseFloat(m.package_size) || 0,
            package_cost: parseFloat(m.package_cost) || 0,
            unit_cost: 0 // Se calcula abajo
        }));
        
        // Formatear recetas
        const formattedRecipes = recipes.map(r => ({
            id: r.id,
            name: r.name,
            sheet_name: r.sheet_name || r.name,
            extra_expenses: parseFloat(r.extra_expenses) || 0,
            margin: parseFloat(r.margin) || 0,
            image: r.image || null,
            ingredients: (r.recipe_ingredients || []).map(ri => {
                const matName = ri.raw_materials ? ri.raw_materials.name : '';
                return {
                    material_name: matName,
                    quantity: parseFloat(ri.quantity) || 0
                };
            }).filter(i => i.material_name !== '')
        }));
        
        state.raw_materials = formattedMaterials;
        state.recipes = formattedRecipes;
        
        // Calcular costos unitarios
        state.raw_materials.forEach(m => {
            m.unit_cost = calculateUnitCost(m);
        });
        
        saveState();
        
        // Renderizar vistas
        renderDashboard();
        renderMaterialsTable();
        renderRecipesGrid();
        renderCatalogTable();
        
        if (showNotification) {
            showToast("Datos sincronizados con la nube.");
        }
        return true;
    } catch (e) {
        console.error("Error sincronizando con Supabase:", e);
        if (showNotification) {
            showToast("Error de sincronización. Usando caché local.", "error");
        }
        return false;
    }
}

async function saveMaterialToCloud(material, originalName) {
    if (!supabaseClient) return;
    
    try {
        let error = null;
        if (originalName && originalName.toUpperCase() !== material.name.toUpperCase()) {
            const { error: err } = await supabaseClient
                .from('raw_materials')
                .update({
                    name: material.name,
                    category: material.category,
                    unit: material.unit,
                    package_size: material.package_size,
                    package_cost: material.package_cost
                })
                .eq('name', originalName.toUpperCase());
            error = err;
        } else {
            const { error: err } = await supabaseClient
                .from('raw_materials')
                .upsert({
                    name: material.name,
                    category: material.category,
                    unit: material.unit,
                    package_size: material.package_size,
                    package_cost: material.package_cost
                }, { onConflict: 'name' });
            error = err;
        }
        
        if (error) throw error;
        await syncWithSupabase();
    } catch (e) {
        console.error("Error guardando material en la nube:", e);
        showToast("Error en la nube. Cambios guardados localmente.", "error");
    }
}

async function deleteMaterialFromCloud(name) {
    if (!supabaseClient) return;
    
    try {
        const { error } = await supabaseClient
            .from('raw_materials')
            .delete()
            .eq('name', name.toUpperCase());
            
        if (error) throw error;
        await syncWithSupabase();
    } catch (e) {
        console.error("Error eliminando material de la nube:", e);
        showToast("Error al eliminar en la nube.", "error");
    }
}

async function saveRecipeToCloud(recipe, originalName) {
    if (!supabaseClient) return;
    
    try {
        let recipeData = null;
        let recipeError = null;
        
        const recipeBody = {
            name: recipe.name,
            sheet_name: recipe.sheet_name || recipe.name,
            extra_expenses: recipe.extra_expenses,
            margin: recipe.margin,
            image: recipe.image || null
        };
        
        if (originalName && originalName.toUpperCase() !== recipe.name.toUpperCase()) {
            const { data, error } = await supabaseClient
                .from('recipes')
                .update(recipeBody)
                .eq('name', originalName.toUpperCase())
                .select();
            recipeData = data;
            recipeError = error;
        } else {
            const { data, error } = await supabaseClient
                .from('recipes')
                .upsert(recipeBody, { onConflict: 'name' })
                .select();
            recipeData = data;
            recipeError = error;
        }
            
        if (recipeError) throw recipeError;
        if (!recipeData || recipeData.length === 0) throw new Error("No retornó datos al guardar la receta");
        
        const recipeId = recipeData[0].id;
        
        const { error: delError } = await supabaseClient
            .from('recipe_ingredients')
            .delete()
            .eq('recipe_id', recipeId);
            
        if (delError) throw delError;
        
        const ingredientsToInsert = recipe.ingredients.map(ing => {
            const mat = state.raw_materials.find(m => m.name.toUpperCase() === ing.material_name.toUpperCase());
            if (!mat || !mat.id) return null;
            return {
                recipe_id: recipeId,
                material_id: mat.id,
                quantity: ing.quantity
            };
        }).filter(x => x !== null);
        
        if (ingredientsToInsert.length > 0) {
            const { error: insError } = await supabaseClient
                .from('recipe_ingredients')
                .insert(ingredientsToInsert);
            if (insError) throw insError;
        }
        
        await syncWithSupabase();
    } catch (e) {
        console.error("Error guardando receta en la nube:", e);
        showToast("Error al guardar receta en la nube.", "error");
    }
}

async function deleteRecipeFromCloud(name) {
    if (!supabaseClient) return;
    
    try {
        const { error } = await supabaseClient
            .from('recipes')
            .delete()
            .eq('name', name.toUpperCase());
            
        if (error) throw error;
        await syncWithSupabase();
    } catch (e) {
        console.error("Error eliminando receta de la nube:", e);
        showToast("Error al eliminar receta en la nube.", "error");
    }
}

// Configurar canales en tiempo real para escuchar cambios en la base de datos
function setupRealtimeSubscription() {
    if (!supabaseClient) return;
    
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
    }
    
    // Crear un canal para escuchar cambios de inserts, updates y deletes en las tres tablas
    realtimeChannel = supabaseClient.channel('db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'raw_materials' },
            async (payload) => {
                console.log('Cambio en raw_materials detectado por canal en tiempo real:', payload);
                await syncWithSupabase(false); // Sincronización silenciosa
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'recipes' },
            async (payload) => {
                console.log('Cambio en recipes detectado por canal en tiempo real:', payload);
                await syncWithSupabase(false); // Sincronización silenciosa
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'recipe_ingredients' },
            async (payload) => {
                console.log('Cambio en recipe_ingredients detectado por canal en tiempo real:', payload);
                await syncWithSupabase(false); // Sincronización silenciosa
            }
        )
        .subscribe((status) => {
            console.log('Estado del canal Supabase Realtime:', status);
        });
}

// MODAL RECETAS - QUITAR IMAGEN
function removeRecipeImage() {
    tempRecipe.image = null;
    
    const preview = document.getElementById("recipe-modal-image-preview");
    const placeholder = document.getElementById("recipe-modal-image-placeholder");
    const removeBtn = document.getElementById("btn-remove-recipe-image");
    const imgInput = document.getElementById("recipe-image-input");
    
    if (preview) {
        preview.src = "";
        preview.style.display = "none";
    }
    if (placeholder) {
        placeholder.style.display = "flex";
    }
    if (removeBtn) {
        removeBtn.style.display = "none";
    }
    if (imgInput) {
        imgInput.value = "";
    }
}

// INGRESO Y RECONEXIÓN OFFLINE
function enterOfflineMode() {
    const overlay = document.getElementById("login-overlay");
    if (overlay) overlay.style.display = "none";
    
    const statusText = document.getElementById("supabase-status-text");
    const syncBtn = document.getElementById("btn-sync-supabase");
    const logoutBtn = document.getElementById("btn-logout");
    
    if (statusText) {
        statusText.innerText = "Sin Conexión (Local)";
        statusText.style.color = "var(--danger)";
    }
    if (syncBtn) syncBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-flex";
    
    const offlineBanner = document.getElementById("offline-banner");
    if (offlineBanner) {
        offlineBanner.style.display = "flex";
    }
    
    showToast("Ingresado en Modo sin Conexión.", "error");
}

function attemptReconnect() {
    const overlay = document.getElementById("login-overlay");
    if (overlay) {
        overlay.style.display = "flex";
        const errorMsg = document.getElementById("login-error-msg");
        if (errorMsg) errorMsg.style.display = "none";
    }
}

// INTEGRACIÓN CON WHATSAPP
function shareProductWhatsApp(productName, price) {
    const text = `🧁 *Candys sweet* 🧁\n\nEl precio de *${productName}* es de *$${parseFloat(price).toFixed(2)}*.`;
    const encodedText = encodeURIComponent(text);
    
    navigator.clipboard.writeText(text).then(() => {
        showToast("Mensaje copiado al portapapeles.");
    }).catch(err => {
        console.error("No se pudo copiar el texto: ", err);
    });
    
    const url = `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank');
}

function shareCatalogWhatsApp() {
    if (state.recipes.length === 0) {
        alert("No hay productos cargados en el catálogo para compartir.");
        return;
    }
    
    let text = `🧁 *Candys sweet - Lista de Precios* 🧁\n\n`;
    const sortedRecipes = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedRecipes.forEach(r => {
        const d = getRecipeDetails(r);
        text += `• *${r.name}*: $${d.finalPrice.toFixed(2)}\n`;
    });
    
    text += `\n_Precios válidos al ${new Date().toLocaleDateString()}_`;
    const encodedText = encodeURIComponent(text);
    
    navigator.clipboard.writeText(text).then(() => {
        showToast("Catálogo copiado al portapapeles.");
    }).catch(err => {
        console.error("No se pudo copiar el texto: ", err);
    });
    
    const url = `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank');
}

// Hacer globales las funciones llamadas desde el HTML
window.syncWithSupabase = syncWithSupabase;
window.handleLoginSubmit = handleLoginSubmit;
window.toggleLoginPassword = toggleLoginPassword;
window.logout = logout;
window.enterOfflineMode = enterOfflineMode;
window.attemptReconnect = attemptReconnect;
window.shareProductWhatsApp = shareProductWhatsApp;
window.shareCatalogWhatsApp = shareCatalogWhatsApp;
window.removeRecipeImage = removeRecipeImage;

