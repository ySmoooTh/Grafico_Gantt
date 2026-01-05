// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// CONFIGURAÇÃO
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

const API_BASE_URL = window.API_BASE_URL || 'http://localhost:5000';

let allTasks = [];
let DAY_WIDTH_PX = 10;
const ROW_HEIGHT_PX = 50;

let isSyncing = false;
let currentStatusFilter = 'ALL';
let zoomLevel = 'week';
let currentMode = 'TASKS';

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// ELEMENTOS DOM
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

const taskListBody = document.getElementById('task-list-body');
const timelineBody = document.getElementById('timeline-body');
const timelineHeader = document.getElementById('timeline-header');

const classificationSelect = document.getElementById('classification_select');
const sectorSelect = document.getElementById('sector_select');
const projectSelect = document.getElementById('project_select');
const responsibleSelect = document.getElementById('responsible_select');
const zoomSelect = document.getElementById('zoom_select');

const dataTableBody = document.getElementById('data-table-body');
const durationDisplay = document.getElementById('project-duration-display');

const taskListContainer = document.getElementById('task-list-container');
const timelineContainer = document.getElementById('timeline-container');
const dataTableContainer = document.getElementById('data-table-container');
const toggleModeButton = document.getElementById('toggle_mode_button');

// #ZOOM

function setZoomLevel(level) {
	if (level === zoomLevel) return;
	zoomLevel = level;

	const zoomMap = {
		day: 40,
		day_compact: 20,
		week: 10,
		month: 5
	};

	DAY_WIDTH_PX = zoomMap[zoomLevel] || 10;
	filterAndDrawGantt();
}

function syncScroll(source) {
	if (isSyncing) return;
	isSyncing = true;

	const { scrollLeft, scrollTop } = source;

	if (source === taskListContainer) {
		timelineContainer.scrollTop = scrollTop;
		dataTableContainer.scrollTop = scrollTop;
	} else if (source === timelineContainer) {
		taskListContainer.scrollTop = scrollTop;
		dataTableContainer.scrollTop = scrollTop;
		timelineHeader.scrollLeft = scrollLeft;
	} else {
		taskListContainer.scrollTop = scrollTop;
		timelineContainer.scrollTop = scrollTop;
	}

	setTimeout(() => (isSyncing = false), 40);
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// MODO TAREFAS / PROJETOS
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

function toggleViewMode() {
	currentMode = currentMode === 'TASKS' ? 'PROJECTS' : 'TASKS';

	if (toggleModeButton) {
		toggleModeButton.innerText =
			currentMode === 'TASKS' ? 'Ver Projetos' : 'Ver Tarefas';
	}

	requestData();
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// INIT
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

document.addEventListener('DOMContentLoaded', () => {
	if (zoomSelect) setZoomLevel(zoomSelect.value);

	taskListContainer?.addEventListener('scroll', e => syncScroll(e.target));
	timelineContainer?.addEventListener('scroll', e => syncScroll(e.target));
	dataTableContainer?.addEventListener('scroll', e => syncScroll(e.target));

	classificationSelect?.addEventListener('change', filterAndDrawGantt);
	sectorSelect?.addEventListener('change', filterAndDrawGantt);
	projectSelect?.addEventListener('change', filterAndDrawGantt);
	responsibleSelect?.addEventListener('change', filterAndDrawGantt);
	zoomSelect?.addEventListener('change', e => setZoomLevel(e.target.value));
	toggleModeButton?.addEventListener('click', toggleViewMode);

	requestData();
	setInterval(requestData, 30000);
});

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// API
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

async function requestData() {
	const endpoint =
		currentMode === 'TASKS'
			? `${API_BASE_URL}/api/gantt`
			: `${API_BASE_URL}/api/projects`;

	const scrollLeft = timelineContainer?.scrollLeft || 0;
	const scrollTop = taskListContainer?.scrollTop || 0;

	try {
		const resp = await fetch(endpoint);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
		const data = await resp.json();

		allTasks = processData(data);
		setupFilters(allTasks);
		filterAndDrawGantt(null, scrollLeft, scrollTop);
		createStatusLegend(allTasks);

	} catch (err) {
		document.getElementById('gantt-container').innerHTML =
			'<div class="error-msg">Erro ao carregar dados.</div>';
	}
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// NORMALIZAÇÃO DOS DADOS
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

function processData(data) {
	return data.map(row => {
		const plannedStart = new Date(Date.UTC(row[3], row[4], row[5]));
		const plannedEnd = new Date(Date.UTC(row[6], row[7], row[8]));

		const realStart = row[9] != null
			? new Date(Date.UTC(row[9], row[10], row[11]))
			: null;

		const realEnd = row[12] != null
			? new Date(Date.UTC(row[12], row[13], row[14]))
			: null;

		return {
			id: row[0],
			name: row[1],
			originalName: row[1],
			status: row[2],
			startDate: plannedStart,
			endDate: plannedEnd,
			realStartDate: realStart,
			realEndDate: realEnd,
			responsible: row[15],
			project: row[16],
			colorClass: row[17],
			sector: row[30] || '',
			classification: row[31] || ''
		};
	});
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// DATAS
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

function diffInDays(a, b) {
	const d1 = new Date(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
	const d2 = new Date(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
	return Math.ceil(Math.abs(d2 - d1) / 86400000);
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// FILTRO + DRAW (estrutura mantida)
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

function filterAndDrawGantt(_, restoreLeft = null, restoreTop = null) {
	let tasks = [...allTasks];

	if (projectSelect.value !== 'ALL')
		tasks = tasks.filter(t => t.project === projectSelect.value);

	if (responsibleSelect.value !== 'ALL')
		tasks = tasks.filter(t => t.responsible === responsibleSelect.value);

	if (classificationSelect?.value !== 'ALL')
		tasks = tasks.filter(t => t.classification === classificationSelect.value);

	if (sectorSelect?.value !== 'ALL')
		tasks = tasks.filter(t => t.sector === sectorSelect.value);

	drawGantt(tasks, restoreLeft);

	if (restoreTop != null) {
		taskListContainer.scrollTop = restoreTop;
		timelineContainer.scrollTop = restoreTop;
		dataTableContainer.scrollTop = restoreTop;
	}
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// DRAW (cabeçalho + barras)


function drawGantt(tasks, restoreLeft = null) {
	taskListBody.innerHTML = '';
	timelineBody.innerHTML = '';
	dataTableBody.innerHTML = '';

	if (!tasks.length) return;

	const minDate = new Date(Math.min(...tasks.map(t => t.startDate)));
	const maxDate = new Date(Math.max(...tasks.map(t => t.endDate)));

	renderTimelineHeader(minDate, maxDate);
	renderBars(tasks, minDate);

	if (restoreLeft != null) {
		timelineContainer.scrollLeft = restoreLeft;
		timelineHeader.scrollLeft = restoreLeft;
	}
}

function drawGantt(tasksToDraw, scrollLeftToRestore = null) {
	console.log(`drawGantt: Desenhando ${tasksToDraw.length} itens...`);

	taskListBody.innerHTML = '';
	timelineBody.innerHTML = '';
	dataTableBody.innerHTML = ''; 

	if (tasksToDraw.length === 0) {
		taskListBody.innerHTML = '<div class="loading">Nenhum item para este filtro.</div>';
		if (document.getElementById('total-duration-value')) {
			document.getElementById('total-duration-value').innerText = '0 dias';
		}
	}
	

	const selectedProject = projectSelect.value;
	if (durationDisplay) {
		
		if (currentMode === 'PROJECTS' || (selectedProject !== 'ALL' && tasksToDraw.length > 0)) {
			const totalDuration = calculateProjectDuration(tasksToDraw);
			document.getElementById('total-duration-value').innerText = `${totalDuration} dias`;
			durationDisplay.style.display = 'block'; 
		} else {
			durationDisplay.style.display = 'none';
		}
	}

	if (tasksToDraw.length === 0) {
		return; 
	}

	
	const { minDate, maxDate } = getMinMaxDates(tasksToDraw);
	
	const totalDurationDays = renderTimelineHeader(minDate, maxDate);

	const totalWidth = totalDurationDays * DAY_WIDTH_PX;
	timelineHeader.style.width = `${totalWidth}px`;
	timelineBody.style.width = `${totalWidth}px`;
	
	const totalHeight = tasksToDraw.length * ROW_HEIGHT_PX;
	taskListBody.style.height = `${totalHeight}px`; 
	timelineBody.style.height = `${totalHeight}px`;
	dataTableBody.style.height = `${totalHeight}px`; 

	renderGantt(tasksToDraw, minDate);
	
	renderTodayLine(minDate);
	
	
	if (scrollLeftToRestore !== null && timelineContainer) {
		timelineContainer.scrollLeft = scrollLeftToRestore;
		timelineHeader.scrollLeft = scrollLeftToRestore; 
	}
}


function sanitizeStatus(status) {
	if (!status) return 'status-default';
	return 'status-' + status.toLowerCase()
		.replace(/\s+/g, '-') 
		.replace(/[^\w-]+/g, ''); 
}


function escapeHtml(text) {
	return String(text || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Função utilitária para formatar a data para o Tooltip/Exibição (DD/MM/YYYY)
 */
function formatDateForDisplay(dateObj) {
	if (!dateObj) return '--/--/----';

	const day = String(dateObj.getUTCDate()).padStart(2, '0');
	const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
	const year = dateObj.getUTCFullYear();
	return `${day}/${month}/${year}`;
}



function renderGantt(tasks, ganttStartDate) {
	
	tasks.forEach((task, index) => {
		

		const topPosition = `${index * ROW_HEIGHT_PX}px`;
		

		const taskRow = document.createElement('div');
		taskRow.className = 'task-row';
		taskRow.style.top = topPosition; 
		taskRow.innerText = task.name;
	
		taskRow.title = (currentMode === 'TASKS') ? 
			`${task.originalName} (Resp: ${task.responsible})` : 
			`${task.name} (ID: ${task.id})`;
		taskListBody.appendChild(taskRow);


		const separatorLeft = document.createElement('div');
		separatorLeft.className = 'gantt-separator-line';
		separatorLeft.style.top = `${(index + 1) * ROW_HEIGHT_PX}px`;
		taskListBody.appendChild(separatorLeft);
		

		const duration = diffInDays(task.startDate, task.endDate) + 1;

		const dataRow = document.createElement('div');
		dataRow.className = 'data-row';
		dataRow.style.top = topPosition;

		dataRow.innerHTML = `
			<div class="data-cell">${formatDateForDisplay(task.startDate)}</div>
			<div class="data-cell">${formatDateForDisplay(task.endDate)}</div>
			<div class="data-cell">${duration} dias</div>
		`;
		dataTableBody.appendChild(dataRow);

	
		const separatorData = document.createElement('div');
		separatorData.className = 'gantt-separator-line';
		separatorData.style.top = `${(index + 1) * ROW_HEIGHT_PX}px`;
		dataTableBody.appendChild(separatorData);
		
	
		const offsetDays = diffInDays(ganttStartDate, task.startDate);
		const durationDays = duration; 
		
		const left = offsetDays * DAY_WIDTH_PX;
		const width = durationDays * DAY_WIDTH_PX;
		
		const statusClass = task.colorClass || sanitizeStatus(task.status);
		
		const bar = document.createElement('div');
		bar.className = 'gantt-bar';
		bar.classList.add(statusClass); 
		

		bar.style.top = `${index * ROW_HEIGHT_PX + 15}px`; 
		bar.style.left = `${left}px`;
		bar.style.width = `${width}px`;

    
		let realStartPercent = 0; 
		const isTracked = (statusClass === 'status-em-andamento' || statusClass === 'status-pendente');

		if (isTracked && task.realStartDate) {
			
			const diffStartToReal = diffInDays(task.startDate, task.realStartDate);
			const realStartDays = Math.max(0, diffStartToReal);
			
			realStartPercent = (realStartDays / durationDays) * 100;
			realStartPercent = Math.min(100, realStartPercent); 
			
			bar.style.setProperty('--real-start-percent', `${realStartPercent}%`);
			bar.classList.add('gantt-bar-gradient');
			
		} else {
			bar.style.setProperty('--real-start-percent', `0%`);
			bar.classList.remove('gantt-bar-gradient'); 
		}
		
		
		
		const barLabel = document.createElement('span');
		barLabel.className = 'gantt-bar-label';
		barLabel.innerHTML = `<strong>${escapeHtml(task.responsible)}</strong> ${escapeHtml(task.name)}`;
		bar.appendChild(barLabel);
		
		let tooltipTitle = `[${task.status}] ${task.originalName}\n`;
		tooltipTitle += `Planejado: ${formatDateForDisplay(task.startDate)} a ${formatDateForDisplay(task.endDate)}`;
		if (task.realStartDate) {
			tooltipTitle += `\nInício Real: ${formatDateForDisplay(task.realStartDate)}`;
			tooltipTitle += `\nFim Real/Prazo: ${formatDateForDisplay(task.realEndDate)}`;
		}
		bar.title = tooltipTitle;
		
		timelineBody.appendChild(bar);
		
		// LÓGICA DE EDIÇÃO (Abrir Modal)
		if (currentMode === 'TASKS' || currentMode === 'PROJECTS') {
			bar.dataset.itemId = task.id; // dataset.itemId para Task ou Project ID
			bar.style.cursor = 'pointer';
			bar.addEventListener('click', (e) => {
				e.stopPropagation();
				
				
				if (currentMode === 'PROJECTS') {
					console.warn("Aviso: Edição de datas de Projetos requer implementação do endpoint PUT na aba PRINCIPAL.");
				}
				openEditDatesModal(task);
			});
		} else {
		
			bar.style.cursor = 'default';
			bar.addEventListener('click', (e) => {
				e.stopPropagation();
			});
		}
		
	
		const separatorRight = document.createElement('div');
		separatorRight.className = 'gantt-separator-line';
		separatorRight.style.top = `${(index + 1) * ROW_HEIGHT_PX}px`; 
		timelineBody.appendChild(separatorRight);
	});
}


async function openEditDatesModal(task) {
	
	if (!task.id) {
		console.error("Erro: ID da tarefa/projeto ausente. Não é possível editar.");
		return;
	}
	
	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';

	const modal = document.createElement('div');
	modal.className = 'modal';

	const isProjectMode = currentMode === 'PROJECTS';
	const titleText = isProjectMode ? 'Editar Datas do Projeto' : 'Editar Datas da Tarefa';
	const startLabel = isProjectMode ? 'Início:' : 'Início real:';
	const endLabel = isProjectMode ? 'Prazo:' : 'Prazo/Fim:';

	modal.innerHTML = `
		<div class="modal-header"><strong>${titleText}</strong></div>
		<div class="modal-body">
			<label>${isProjectMode ? 'Projeto' : 'Tarefa'}: <em>${escapeHtml(task.originalName || '')}</em></label>
			<label>Responsável: <em>${escapeHtml(task.responsible || '')}</em></label>
			<div style="margin-top:8px;">
				<label>${startLabel}: <input type="date" id="modal-start" /></label>
			</div>
			<div style="margin-top:8px;">
				<label>${endLabel}: <input type="date" id="modal-end" /></label>
			</div>
			<div class="modal-error" style="display:none;color:#a00;margin-top:8px;"></div>
		</div>
		<div class="modal-actions">
			<button id="modal-cancel">Cancelar</button>
			<button id="modal-save">Salvar</button>
		</div>
	`;

	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	const startInput = modal.querySelector('#modal-start');
	const endInput = modal.querySelector('#modal-end');
	const errBox = modal.querySelector('.modal-error');

	const toYMD = dateObj => {
		if (!dateObj) return ''; 
		const year = dateObj.getUTCFullYear();
		const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
		const day = String(dateObj.getUTCDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	};

	// Datas de referência para o modal
	if (isProjectMode) {
		// Projeto: usa plannedStartDate/plannedEndDate
		startInput.value = toYMD(task.startDate);
		endInput.value = toYMD(task.endDate);
	} else {
		// Tarefa: usa realStartDate/realEndDate
		startInput.value = toYMD(task.realStartDate);
		endInput.value = toYMD(task.realEndDate);
	}


	modal.querySelector('#modal-cancel').addEventListener('click', () => closeModal(overlay));
	modal.querySelector('#modal-save').addEventListener('click', async () => {
		errBox.style.display = 'none';
		
		let newStart = startInput.value || ''; 
		let newEnd = endInput.value || ''; 	
		
		
		if (newStart) { newStart += ' 00:00:00'; }
		if (newEnd) { newEnd += ' 00:00:00'; }

		if (newStart && newEnd) {
			const [datePartS] = newStart.split(' ');
			const [datePartE] = newEnd.split(' ');
			
			const [sy, sm, sd] = datePartS.split('-').map(n => parseInt(n));
			const [ey, em, ed] = datePartE.split('-').map(n => parseInt(n));
			
			
			const startDateSafe = new Date(sy, sm - 1, sd); 
			const endDateSafe = new Date(ey, em - 1, ed); 

			if (startDateSafe > endDateSafe) {
				errBox.innerText = 'Data de início não pode ser maior que a data de fim.';
				errBox.style.display = 'block';
				return;
			}
		}

		const saveBtn = modal.querySelector('#modal-save');
		const cancelBtn = modal.querySelector('#modal-cancel');
		saveBtn.disabled = true;
		cancelBtn.disabled = true;
		saveBtn.innerText = 'Salvando...';

		try {
			const endpoint = isProjectMode ? 
				`${LOCAL_API_IP}/api/projects/${encodeURIComponent(task.id)}` : 
				`${LOCAL_API_IP}/api/gantt/${encodeURIComponent(task.id)}`;
			
			const resp = await fetch(endpoint, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ startDate: newStart, endDate: newEnd }),
				mode: 'cors', 	
				cache: 'no-store'
			});

			if (!resp.ok) {
				const txt = await resp.text();
				throw new Error(`Erro servidor: ${resp.status} ${txt}`);
			}
			
			console.log("PUT bem-sucedido. Aguardando 1.5s para recarregar...");
			await new Promise(r => setTimeout(r, 1500));

			requestData(); 
			closeModal(overlay);
		} catch (err) {
			errBox.innerText = `Falha ao salvar: ${err.message}`;
			errBox.style.display = 'block';
			saveBtn.disabled = false;
			cancelBtn.disabled = false;
			saveBtn.innerText = 'Salvar';
		}
	});

	overlay.addEventListener('click', (ev) => {
		if (ev.target === overlay) closeModal(overlay);
	});
}

function closeModal(node) {
	if (node && node.parentNode) node.parentNode.removeChild(node);
}


function getStatusDefinitions() {
	return [
		{ keys: ['EM ANDAMENTO', 'EM-ANDAMENTO', 'EM_ANDAMENTO', 'ANDAMENTO'], cls: 'status-em-andamento', label: 'Em andamento', color: '#0dcaf0' },
		{ keys: ['ATRASADO'], cls: 'status-atrasado', label: 'Atrasado', color: '#dc3545' },
		{ keys: ['FINALIZADO', 'CONCLUÍDO', 'CONCLUIDO'], cls: 'status-finalizado', label: 'Finalizado', color: '#28a745' },
		{ keys: ['PENDENTE'], cls: 'status-pendente', label: 'Pendente', color: '#ffc107' },
		{ keys: ['CANCELADO'], cls: 'status-cancelado', label: 'Cancelado', color: '#6c757d' },
		{ keys: ['DEFAULT', 'OUTRO', ''], cls: 'status-default', label: 'Outro', color: '#ccc' },
	];
}

function getStatusKeysFromClass(statusClass) {
	const STATUS_DEFINITIONS = getStatusDefinitions();
	const definition = STATUS_DEFINITIONS.find(d => d.cls === statusClass);
	return definition ? definition.keys : [];
}

function highlightStatusLegend(statusClass) {
	const legendItems = document.querySelectorAll('.legend-item');
	legendItems.forEach(item => {
		if (item.classList.contains('legend-item-all')) {
			if (statusClass === 'ALL') {
				item.classList.add('active-filter');
			} else {
				item.classList.remove('active-filter');
			}
			return; 
		}
		
		const colorElement = item.querySelector('.legend-color');
		let itemClass = '';
		if (colorElement) {
			 const classList = colorElement.className.split(' ');
			 itemClass = classList.find(c => c.startsWith('status-'));
		}
		
		item.classList.remove('active-filter');
		
		if (itemClass === statusClass) {
			item.classList.add('active-filter');
		}
	});
	
	if (statusClass === 'ALL') {
			const allItem = document.querySelector('.legend-item-all');
			if (allItem) allItem.classList.add('active-filter');
	}
}

function createStatusLegend(tasks) {
	const main = document.querySelector('.main-content') || document.getElementById('gantt-container');
	if (!main) return;

	const STATUS_DEFINITIONS = getStatusDefinitions(); 
	const presentStatuses = new Set();
	tasks.forEach(t => {
		const s = (t.status || '').toString().trim().toUpperCase();
		if (s) presentStatuses.add(s);
	});

	const existing = document.querySelector('.footer-legend');
	if (existing) existing.remove();

	const legend = document.createElement('div');
	legend.className = 'footer-legend';

	const title = document.createElement('span');
	title.innerText = 'Legenda:';
	legend.appendChild(title);
	
	const allItem = document.createElement('div');
	allItem.className = 'legend-item legend-item-all status-default active-filter'; 
	allItem.innerHTML = `<div class="legend-label">Todos os status</div>`;
	allItem.style.cursor = 'pointer';
	allItem.addEventListener('click', () => {
		currentStatusFilter = 'ALL';
		filterAndDrawGantt(); 
	});
	legend.appendChild(allItem);
	
	STATUS_DEFINITIONS.forEach(def => {
	
		const matches = Array.from(presentStatuses).some(s => {
			const sClean = s.replace(/[\s-]/g, '');
			return def.keys.some(k => k.replace(/[\s-]/g, '') === sClean);
		});
		
	
		if (def.cls === 'status-default' && !presentStatuses.has('')) return;
		if (!matches && def.cls !== 'status-default') return;

		const item = document.createElement('div');
		item.className = 'legend-item';

		const colorBox = document.createElement('div');
	
		colorBox.className = 'legend-color';
		colorBox.style.backgroundColor = def.color; 
		item.appendChild(colorBox);

		const lbl = document.createElement('div');
		lbl.className = 'legend-label';
		lbl.innerText = def.label;
		item.appendChild(lbl);
		
		item.style.cursor = 'pointer';
		item.dataset.statusClass = def.cls;
		item.addEventListener('click', () => {
			const clickedClass = item.dataset.statusClass;
			
			if (currentStatusFilter === clickedClass) {
				currentStatusFilter = 'ALL';
			} else {
				currentStatusFilter = clickedClass;
			}
			filterAndDrawGantt(); 
		});

		legend.appendChild(item);
	});

	main.appendChild(legend);
	
	highlightStatusLegend(currentStatusFilter);
}
