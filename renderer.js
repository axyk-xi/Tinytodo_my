// ============================================
// TinyTodo 渲染进程
// ============================================

class TodoApp {
    constructor() {
        this.todos = [];
        this.selectedTodoId = null;
        this.dragState = null;
        this.elements = {
            todoList: document.getElementById('todoList'),
            todoListContainer: document.getElementById('todoListContainer'),
            addInput: document.getElementById('addInput'),
            emptyState: document.getElementById('emptyState')
        };

        this.init();
    }

    async init() {
        // 加载数据
        this.todos = this.normalizeTodos(await window.todoAPI.loadTodos());

        // 渲染列表
        this.render();

        // 绑定事件
        this.bindEvents();

        this.initTheme();
        this.updateAddPlaceholder();
    }

    bindEvents() {
        // 回车新增
        this.elements.addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                this.addTodo();
            }
        });

        this.elements.todoListContainer.addEventListener('click', (e) => {
            if (e.target === this.elements.todoListContainer || e.target === this.elements.todoList) {
                this.selectTodo(null);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.selectTodo(null);
            }
        });
    }

    // 初始化主题
    initTheme() {
        const savedTheme = localStorage.getItem('todo-theme') || 'dark';
        this.applyTheme(savedTheme);
        if (window.todoAPI && typeof window.todoAPI.onToggleTheme === 'function') {
            window.todoAPI.onToggleTheme(() => this.toggleTheme());
        }
    }

    // 切换主题
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        localStorage.setItem('todo-theme', newTheme);
    }

    // 应用主题
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        window.todoAPI.setTheme(theme);
    }

    // 将旧的平铺 todo 迁移为树结构
    normalizeTodos(todos) {
        if (!Array.isArray(todos)) return [];

        return todos.map(todo => ({
            id: todo.id || this.createId(),
            text: todo.text || '',
            completed: Boolean(todo.completed),
            createdAt: todo.createdAt || Date.now(),
            expanded: todo.expanded !== false,
            children: this.normalizeTodos(todo.children)
        }));
    }

    createId() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // 新增 todo
    addTodo() {
        const text = this.elements.addInput.value.trim();
        if (!text) return;

        const todo = {
            id: this.createId(),
            text,
            completed: false,
            createdAt: Date.now(),
            expanded: true,
            children: []
        };

        const selected = this.selectedTodoId ? this.findTodo(this.selectedTodoId) : null;
        if (selected) {
            selected.todo.children.unshift(todo);
            selected.todo.expanded = true;
        } else {
            this.todos.unshift(todo);
        }

        this.elements.addInput.value = '';
        this.save();
        this.render('add', todo.id);
    }

    // 切换完成状态
    toggleTodo(id) {
        const path = this.findPath(id);
        if (path.length === 0) return;

        const todo = path[path.length - 1];
        this.setCompletion(todo, !todo.completed);
        this.updateAncestors(path);

        this.sortTodos();
        this.save();
        this.render('complete', id);
    }

    // 删除 todo
    deleteTodo(id) {
        const el = document.querySelector(`[data-id="${id}"]`);
        if (el) {
            el.classList.add('removing');
            // 避免 animationend 在某些情况下不触发，使用 setTimeout 作为降级方案
            setTimeout(() => {
                this.removeTodo(id);
            }, 260);
        } else {
            this.removeTodo(id);
        }
    }

    removeTodo(id) {
        this.todos = this.removeTodoFromList(this.todos, id);
        if (this.selectedTodoId === id || !this.findTodo(this.selectedTodoId)) {
            this.selectTodo(null, false);
        }
        this.recomputeParentCompletion(this.todos);
        this.sortTodos();
        this.save();
        this.render();
    }

    removeTodoFromList(list, id) {
        return list
            .filter(todo => todo.id !== id)
            .map(todo => ({
                ...todo,
                children: this.removeTodoFromList(todo.children, id)
            }));
    }

    setCompletion(todo, completed) {
        todo.completed = completed;
        todo.children.forEach(child => this.setCompletion(child, completed));
    }

    updateAncestors(path) {
        for (let i = path.length - 2; i >= 0; i -= 1) {
            const todo = path[i];
            todo.completed = todo.children.length > 0 && todo.children.every(child => child.completed);
        }
    }

    recomputeParentCompletion(list) {
        list.forEach(todo => {
            this.recomputeParentCompletion(todo.children);
            if (todo.children.length > 0) {
                todo.completed = todo.children.every(child => child.completed);
            }
        });
    }

    // 排序：每一层都保持未完成在上、已完成在下，组内顺序保留
    sortTodos(list = this.todos) {
        list.forEach(todo => this.sortTodos(todo.children));
        const active = list.filter(t => !t.completed);
        const completed = list.filter(t => t.completed);
        list.splice(0, list.length, ...active, ...completed);
    }

    findTodo(id, list = this.todos, parent = null) {
        if (!id) return null;

        for (let index = 0; index < list.length; index += 1) {
            const todo = list[index];
            if (todo.id === id) {
                return { todo, parent, list, index };
            }

            const found = this.findTodo(id, todo.children, todo);
            if (found) return found;
        }

        return null;
    }

    findPath(id, list = this.todos, path = []) {
        for (const todo of list) {
            const nextPath = [...path, todo];
            if (todo.id === id) return nextPath;

            const childPath = this.findPath(id, todo.children, nextPath);
            if (childPath.length > 0) return childPath;
        }

        return [];
    }

    selectTodo(id, shouldRender = true) {
        if (this.selectedTodoId === id) {
            this.updateAddPlaceholder();
            return;
        }
        this.selectedTodoId = id;
        this.updateAddPlaceholder();
        if (shouldRender) this.refreshSelection();
    }

    refreshSelection() {
        document.querySelectorAll('.todo-item.selected').forEach(el => el.classList.remove('selected'));
        if (this.selectedTodoId) {
            const el = document.querySelector(`.todo-item[data-id="${this.selectedTodoId}"]`);
            if (el) el.classList.add('selected');
        }
    }

    updateAddPlaceholder() {
        const selected = this.findTodo(this.selectedTodoId);
        if (selected) {
            this.elements.addInput.placeholder = `添加「${selected.todo.text}」的子待办...`;
        } else {
            this.elements.addInput.placeholder = '添加新的待办事项...';
        }
    }

    toggleExpanded(id) {
        const found = this.findTodo(id);
        if (!found) return;

        found.todo.expanded = !found.todo.expanded;
        this.save();
        this.render();
    }

    canReorder(draggedId, targetId) {
        if (!draggedId || !targetId || draggedId === targetId) return false;

        const dragged = this.findTodo(draggedId);
        const target = this.findTodo(targetId);
        if (!dragged || !target) return false;

        return dragged.list === target.list && dragged.todo.completed === target.todo.completed;
    }

    reorderTodo(draggedId, targetId, position) {
        if (!this.canReorder(draggedId, targetId)) return;

        const dragged = this.findTodo(draggedId);
        const target = this.findTodo(targetId);
        if (!dragged || !target) return;

        const list = dragged.list;
        const [movedTodo] = list.splice(dragged.index, 1);
        const targetIndex = list.findIndex(todo => todo.id === targetId);
        const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
        list.splice(insertIndex, 0, movedTodo);
        this.save();
        this.render();
    }

    getDropPosition(event, element) {
        const rect = element.getBoundingClientRect();
        return event.clientY - rect.top > rect.height / 2 ? 'after' : 'before';
    }

    clearDropIndicators() {
        document.querySelectorAll('.drop-before, .drop-after').forEach(el => {
            el.classList.remove('drop-before', 'drop-after');
        });
    }

    endDrag() {
        this.clearDropIndicators();
        const dragging = document.querySelector('.todo-item.dragging');
        if (dragging) dragging.classList.remove('dragging');
        this.dragState = null;
    }

    // 保存到本地
    async save() {
        await window.todoAPI.saveTodos(this.todos);
    }

    // 渲染列表
    render(action, targetId) {
        this.elements.todoList.innerHTML = '';

        const isEmpty = this.todos.length === 0;
        this.elements.emptyState.classList.toggle('visible', isEmpty);

        this.renderTodoList(this.todos, this.elements.todoList, action, targetId, 0);
        this.updateAddPlaceholder();
    }

    renderTodoList(todos, container, action, targetId, level) {
        todos.forEach(todo => {
            const li = this.createTodoElement(todo, action, targetId, level);
            container.appendChild(li);
        });
    }

    // 创建 todo 元素
    createTodoElement(todo, action, targetId, level) {
        const li = document.createElement('li');
        li.className = 'todo-node';

        const hasChildren = todo.children.length > 0;
        const row = document.createElement('div');
        row.className = `todo-item${todo.completed ? ' completed' : ''}${todo.id === this.selectedTodoId ? ' selected' : ''}`;
        row.setAttribute('data-id', todo.id);
        row.style.setProperty('--todo-level', level);
        row.draggable = true;

        row.innerHTML = `
      <button class="todo-toggle${hasChildren ? '' : ' hidden'}" aria-label="${todo.expanded ? '收起' : '展开'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <div class="todo-check" role="button" aria-label="标记完成">
        <svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="todo-text">${this.escapeHtml(todo.text)}</span>
      <button class="todo-delete" aria-label="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="7" y1="7" x2="17" y2="17"/>
          <line x1="7" y1="17" x2="17" y2="7"/>
        </svg>
      </button>
    `;

        if (action === 'add' && todo.id === targetId) {
            row.classList.add('adding');
        }

        if (action === 'complete' && todo.id === targetId) {
            row.classList.add('completing');
        }

        // 事件绑定
        row.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('.todo-check') || e.target.closest('.todo-edit-input')) {
                return;
            }
            this.selectTodo(todo.id);
        });

        row.querySelector('.todo-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasChildren) this.toggleExpanded(todo.id);
        });

        row.querySelector('.todo-check').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTodo(todo.id);
        });

        row.querySelector('.todo-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteTodo(todo.id);
        });

        // 双击编辑
        row.querySelector('.todo-text').addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (todo.completed) return; // 已完成的不允许编辑
            this.startEdit(row, todo);
        });

        row.addEventListener('dragstart', (e) => {
            this.dragState = { id: todo.id };
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', todo.id);
        });

        row.addEventListener('dragover', (e) => {
            const draggedId = this.dragState?.id;
            if (!this.canReorder(draggedId, todo.id)) return;

            e.preventDefault();
            const position = this.getDropPosition(e, row);
            this.clearDropIndicators();
            row.classList.add(position === 'after' ? 'drop-after' : 'drop-before');
        });

        row.addEventListener('dragleave', (e) => {
            if (!row.contains(e.relatedTarget)) {
                row.classList.remove('drop-before', 'drop-after');
            }
        });

        row.addEventListener('drop', (e) => {
            const draggedId = this.dragState?.id || e.dataTransfer.getData('text/plain');
            if (!this.canReorder(draggedId, todo.id)) return;

            e.preventDefault();
            const position = this.getDropPosition(e, row);
            this.reorderTodo(draggedId, todo.id, position);
            this.endDrag();
        });

        row.addEventListener('dragend', () => {
            this.endDrag();
        });

        li.appendChild(row);

        if (hasChildren && todo.expanded) {
            const childList = document.createElement('ul');
            childList.className = 'todo-children';
            this.renderTodoList(todo.children, childList, action, targetId, level + 1);
            li.appendChild(childList);
        }

        return li;
    }

    // 进入编辑模式
    startEdit(li, todo) {
        if (li.classList.contains('editing')) return;
        li.classList.add('editing');
        // 编辑期间禁用拖拽，避免影响输入框内文字选择
        const wasDraggable = li.draggable;
        li.draggable = false;

        const textSpan = li.querySelector('.todo-text');
        const originalText = todo.text;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'todo-edit-input';
        input.value = originalText;
        input.maxLength = 100;
        input.draggable = false;

        textSpan.replaceWith(input);
        input.focus();
        input.select();

        const finishEdit = (save) => {
            if (!li.classList.contains('editing')) return;
            li.classList.remove('editing');
            li.draggable = wasDraggable;

            const newText = input.value.trim();
            if (save && newText && newText !== originalText) {
                todo.text = newText;
                this.save();
                this.updateAddPlaceholder();
            }

            const newSpan = document.createElement('span');
            newSpan.className = 'todo-text';
            newSpan.textContent = save && newText ? newText : originalText;
            input.replaceWith(newSpan);

            // 重新绑定双击
            newSpan.addEventListener('dblclick', () => {
                if (todo.completed) return;
                this.startEdit(li, todo);
            });
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                finishEdit(true);
            } else if (e.key === 'Escape') {
                finishEdit(false);
            }
        });

        input.addEventListener('blur', () => {
            finishEdit(true);
        });
    }

    // HTML 转义（防止 XSS）
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new TodoApp();
});
