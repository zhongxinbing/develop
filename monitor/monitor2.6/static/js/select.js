// ==================== 可搜索下拉框组件 ====================

/**
 * 可搜索下拉框类
 * 支持单选/多选、搜索过滤、标签显示
 */
class SearchableSelect {
    /**
     * @param {Object} options
     * @param {string|HTMLElement} options.container - 容器元素或选择器
     * @param {Array} options.options - 选项数组 [{value, label}]
     * @param {string|Array} options.value - 初始选中值
     * @param {boolean} options.multiple - 是否多选
     * @param {string} options.placeholder - 占位文本
     * @param {Function} options.onChange - 值变化回调
     */
    constructor(options) {
        this.container = typeof options.container === 'string' 
            ? document.querySelector(options.container) 
            : options.container;
        
        if (!this.container) {
            console.error('SearchableSelect: 容器不存在');
            return;
        }

        this.options = options.options || [];
        this.multiple = options.multiple || false;
        this.placeholder = options.placeholder || (this.multiple ? '请选择...' : '请选择...');
        this.onChange = options.onChange || null;
        this._selectedValues = [];
        this._filteredOptions = [];
        this._isOpen = false;
        this._isSearching = false;

        // 初始化选中值
        if (options.value !== undefined) {
            this._selectedValues = this.multiple 
                ? (Array.isArray(options.value) ? options.value : [options.value])
                : (options.value !== null && options.value !== undefined ? [options.value] : []);
        }

        this._render();
        this._bindEvents();
        this._updateDisplay();
    }

    /**
     * 设置选项
     */
    setOptions(newOptions) {
        this.options = newOptions || [];
        this._filteredOptions = this.options.slice();
        this._renderOptions();
        this._updateDisplay();
        this._bindOptionEvents(); // 重新绑定事件
    }

    /**
     * 获取选中值
     */
    getValue() {
        return this.multiple ? this._selectedValues : (this._selectedValues[0] || null);
    }

    /**
     * 设置选中值
     */
    setValue(value, silent = false) {
        
        if (this.multiple) {
            this._selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
        } else {
            this._selectedValues = value !== null && value !== undefined ? [value] : [];
        }
        this._updateDisplay();
        this._renderOptions();
        this._bindOptionEvents();
        if (!silent) {
            this._triggerChange();
        }

    }

    /**
     * 渲染组件
     */
    _render() {
        this.container.innerHTML = `
            <div class="searchable-select ${this.multiple ? 'multi-select' : ''}">
                <div class="select-display" data-action="toggle">
                    <span class="selected-text">${this.placeholder}</span>
                    <span class="arrow">▾</span>
                </div>
                <div class="select-dropdown">
                    <div class="dropdown-search">
                        <input type="text" placeholder="搜索..." data-action="search">
                    </div>
                    <div class="dropdown-options" data-action="options"></div>
                </div>
            </div>
        `;

        this._displayEl = this.container.querySelector('.selected-text');
        this._arrowEl = this.container.querySelector('.arrow');
        this._dropdownEl = this.container.querySelector('.select-dropdown');
        this._optionsContainer = this.container.querySelector('.dropdown-options');
        this._searchInput = this.container.querySelector('[data-action="search"]');

        this._filteredOptions = this.options.slice();
        this._renderOptions();
        this._bindOptionEvents();
    }

    /**
     * 渲染选项列表
     */
    _renderOptions() {
        if (!this._optionsContainer) return;

        if (this._filteredOptions.length === 0) {
            this._optionsContainer.innerHTML = `<div class="no-results">没有匹配的选项</div>`;
            return;
        }

        let html = '';
        this._filteredOptions.forEach(opt => {
            const isSelected = this._selectedValues.includes(opt.value);
            const selectedClass = isSelected ? 'selected' : '';

            if (this.multiple) {
                const checkedAttr = isSelected ? 'checked' : '';
                html += `
                    <div class="dropdown-option ${selectedClass}" data-value="${opt.value}">
                        <label class="option-checkbox-wrapper">
                            <input type="checkbox" class="option-checkbox" value="${opt.value}" ${checkedAttr}>
                            <span class="option-label">${this._escapeHtml(opt.label)}</span>
                        </label>
                    </div>
                `;
            } else {
                const checkIcon = isSelected ? '✓' : '';
                html += `
                    <div class="dropdown-option ${selectedClass}" data-value="${opt.value}">
                        <span class="option-label">${this._escapeHtml(opt.label)}</span>
                        <span class="check-icon">${checkIcon}</span>
                    </div>
                `;
            }
        });

        this._optionsContainer.innerHTML = html;
    }

    /**
     * 更新显示文本
     */
    _updateDisplay() {
        if (!this._displayEl) return;

        if (this._selectedValues.length === 0) {
            this._displayEl.innerHTML = `<span style="color: var(--text-muted);">${this.placeholder}</span>`;
            return;
        }

        if (this.multiple) {
            const selectedLabels = this._selectedValues.map(v => {
                const opt = this.options.find(o => o.value === v);
                return opt ? opt.label : v;
            });

            if (selectedLabels.length <= 2) {
                this._displayEl.innerHTML = selectedLabels.map(label => 
                    `<span class="tag">${this._escapeHtml(label)}</span>`
                ).join('');
            } else {
                const firstTwo = selectedLabels.slice(0, 2).map(l => this._escapeHtml(l));
                this._displayEl.innerHTML = `
                    <span class="tag">${firstTwo.join('</span><span class="tag">')}</span>
                    <span class="tag-more">+${selectedLabels.length - 2}个</span>
                `;
            }
        } else {
            const selectedLabel = this._selectedValues.map(v => {
                const opt = this.options.find(o => o.value === v);
                return opt ? opt.label : v;
            })[0];
            this._displayEl.textContent = selectedLabel || this.placeholder;
        }
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 点击显示/隐藏下拉框
        const display = this.container.querySelector('[data-action="toggle"]');
        if (display) {
            display.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        // 搜索输入 - 实时过滤
        if (this._searchInput) {
            this._searchInput.addEventListener('input', (e) => {
                e.stopPropagation();
                const keyword = e.target.value.toLowerCase();
                this._isSearching = keyword.length > 0;
                this._filteredOptions = this.options.filter(opt => 
                    opt.label.toLowerCase().includes(keyword)
                );
                this._renderOptions();
                this._bindOptionEvents(); // 重新绑定选项事件
            });

            // 阻止搜索框点击关闭下拉
            this._searchInput.addEventListener('click', (e) => e.stopPropagation());
            
            // 搜索框获得焦点时确保下拉打开
            this._searchInput.addEventListener('focus', (e) => {
                e.stopPropagation();
                if (!this._isOpen) {
                    this.open();
                }
            });
        }

        // 点击外部关闭下拉
        document.addEventListener('click', (e) => {
            // 如果点击的是组件内部，不关闭
            if (this.container.contains(e.target)) {
                return;
            }
            this.close();
        });

        // 阻止下拉框内部点击关闭
        if (this._dropdownEl) {
            this._dropdownEl.addEventListener('click', (e) => e.stopPropagation());
        }

        // 键盘事件 - ESC 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        });
    }

    /**
     * 绑定选项事件
     */
    _bindOptionEvents() {
        if (!this._optionsContainer) return;
        
        const options = this._optionsContainer.querySelectorAll('.dropdown-option');
        options.forEach(el => {
            // 移除旧事件避免重复绑定
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);

            const value = newEl.dataset.value;
            if (!value) return;

            // 单选：点击选项选择
            if (!this.multiple) {
                newEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._selectedValues = [value];
                    this._updateDisplay();
                    this.close();
                    this._triggerChange();
                });
            } else {
                // 多选：点击选项切换
                newEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const checkbox = newEl.querySelector('.option-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        const idx = this._selectedValues.indexOf(value);
                        if (checkbox.checked && idx === -1) {
                            this._selectedValues.push(value);
                        } else if (!checkbox.checked && idx !== -1) {
                            this._selectedValues.splice(idx, 1);
                        }
                        this._updateDisplay();
                        this._renderOptions();
                        this._bindOptionEvents();
                        this._triggerChange();
                    }
                });

                // 复选框点击
                const checkbox = newEl.querySelector('.option-checkbox');
                if (checkbox) {
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const value = e.target.value;
                        const idx = this._selectedValues.indexOf(value);
                        if (e.target.checked && idx === -1) {
                            this._selectedValues.push(value);
                        } else if (!e.target.checked && idx !== -1) {
                            this._selectedValues.splice(idx, 1);
                        }
                        this._updateDisplay();
                        this._renderOptions();
                        this._bindOptionEvents();
                        this._triggerChange();
                    });
                }
            }
        });
    }

    /**
     * 触发变化回调
     */
    _triggerChange() {
        if (this.onChange) {
            const value = this.multiple ? this._selectedValues.slice() : (this._selectedValues[0] || null);
            this.onChange(value);
        }
    }

    /**
     * 打开下拉
     */
    open() {
        if (this._isOpen) return;
        this._isOpen = true;
        this._dropdownEl.classList.add('open');
        this._arrowEl.classList.add('open');
        // 聚焦搜索框
        if (this._searchInput) {
            setTimeout(() => {
                this._searchInput.focus();
                this._searchInput.select();
            }, 50);
        }
        // 重置过滤
        this._filteredOptions = this.options.slice();
        this._renderOptions();
        this._bindOptionEvents();
    }

    /**
     * 关闭下拉
     */
    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._dropdownEl.classList.remove('open');
        this._arrowEl.classList.remove('open');
        // 清空搜索
        if (this._searchInput) {
            this._searchInput.value = '';
            this._isSearching = false;
            this._filteredOptions = this.options.slice();
            this._renderOptions();
            this._bindOptionEvents();
        }
    }

    /**
     * 切换下拉
     */
    toggle() {
        this._isOpen ? this.close() : this.open();
    }

    /**
     * HTML 转义
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 销毁组件
     */
    destroy() {
        this.container.innerHTML = '';
    }
}

// 注册到全局
window.SearchableSelect = SearchableSelect;