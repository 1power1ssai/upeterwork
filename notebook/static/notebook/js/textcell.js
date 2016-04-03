// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

define([
    'base/js/utils',
    'notebook/js/cell',
    'base/js/security',
    'services/config',
    'notebook/js/mathjaxutils',
    'notebook/js/celltoolbar',
    'components/marked/lib/marked',
    'codemirror/lib/codemirror',
    'codemirror/mode/gfm/gfm',
    'notebook/js/codemirror-ipythongfm'
], function(
    utils,
    cell,
    security,
    configmod,
    mathjaxutils,
    celltoolbar,
    marked,
    CodeMirror,
    gfm,
    ipgfm
    ) {
    "use strict";
    var Cell = cell.Cell;

    var TextCell = function (options) {
        /**
         * Constructor
         *
         * Construct a new TextCell, codemirror mode is by default 'htmlmixed', 
         * and cell type is 'text' cell start as not redered.
         *
         * Parameters:
         *  options: dictionary
         *      Dictionary of keyword arguments.
         *          events: $(Events) instance 
         *          config: dictionary
         *          keyboard_manager: KeyboardManager instance 
         *          notebook: Notebook instance
         */
        options = options || {};

        // in all TextCell/Cell subclasses
        // do not assign most of members here, just pass it down
        // in the options dict potentially overwriting what you wish.
        // they will be assigned in the base class.
        this.notebook = options.notebook;
        this.events = options.events;
        this.config = options.config;
        this.notebook = options.notebook;
        this.metadata.cell_style = options.cell_style
        
        // we cannot put this as a class key as it has handle to "this".
        var config = utils.mergeopt(TextCell, this.config);
        Cell.apply(this, [{
                    config: config, 
                    keyboard_manager: options.keyboard_manager, 
                    events: this.events,
                    cell_style:this.metadata.cell_style}]);

        this.cell_type = this.cell_type || 'text';
        mathjaxutils = mathjaxutils;
        this.rendered = false;
    };

    TextCell.prototype = Object.create(Cell.prototype);

    TextCell.options_default = {
        cm_config : {
            mode: 'htmlmixed',
            lineWrapping : true,
        }
    };


    /**
     * Create the DOM element of the TextCell
     * @method create_element
     * @private
     */
    TextCell.prototype.create_element = function () {
        Cell.prototype.create_element.apply(this, arguments);
        var that = this;

        var cell = $("<div>").addClass('cell text_cell');
        cell.attr({'tabindex':'2', 'style':this.metadata.cell_style || 'width=100%'});

        var prompt = $('<div/>').addClass('prompt input_prompt');
        cell.append(prompt);
        var inner_cell = $('<div/>').addClass('inner_cell');
        this.celltoolbar = new celltoolbar.CellToolbar({
            cell: this, 
            notebook: this.notebook});
        inner_cell.append(this.celltoolbar.element);
        var input_area = $('<div/>').addClass('input_area');
        this.code_mirror = new CodeMirror(input_area.get(0), this._options.cm_config);
        // In case of bugs that put the keyboard manager into an inconsistent state,
        // ensure KM is enabled when CodeMirror is focused:
        this.code_mirror.on('focus', function () {
            if (that.keyboard_manager) {
                that.keyboard_manager.enable();
            }
        });
        this.code_mirror.on('keydown', $.proxy(this.handle_keyevent,this))
        // The tabindex=-1 makes this div focusable.
        var render_area = $('<div/>').addClass('text_cell_render rendered_html')
            .attr('tabindex','-1');
        inner_cell.append(input_area).append(render_area);
        cell.append(inner_cell);
        this.element = cell;
    };


    // Cell level actions

    TextCell.prototype.add_attachment = function (key, mime_type, b64_data) {
        /**
         * Add a new attachment to this cell
         */
        this.attachments[key] = {};
        this.attachments[key][mime_type] = [b64_data];
    };

    TextCell.prototype.select = function () {
        var cont = Cell.prototype.select.apply(this, arguments);
        if (cont) {
            if (this.mode === 'edit') {
                this.code_mirror.refresh();
            }
        }
        return cont;
    };

    TextCell.prototype.unrender = function () {
        var cont = Cell.prototype.unrender.apply(this);
        if (cont) {
            var text_cell = this.element;
            if (this.get_text() === this.placeholder) {
                this.set_text('');
            }
            this.refresh();
        }
        return cont;
    };

    TextCell.prototype.execute = function () {
        this.render();
    };

    /**
     * setter: {{#crossLink "TextCell/set_text"}}{{/crossLink}}
     * @method get_text
     * @retrun {string} CodeMirror current text value
     */
    TextCell.prototype.get_text = function() {
        return this.code_mirror.getValue();
    };

    /**
     * @param {string} text - Codemiror text value
     * @see TextCell#get_text
     * @method set_text
     * */
    TextCell.prototype.set_text = function(text) {
        this.code_mirror.setValue(text);
        this.unrender();
        this.code_mirror.refresh();
    };

    /**
     * setter :{{#crossLink "TextCell/set_rendered"}}{{/crossLink}}
     * @method get_rendered
     * */
    TextCell.prototype.get_rendered = function() {
        return this.element.find('div.text_cell_render').html();
    };

    /**
     * @method set_rendered
     */
    TextCell.prototype.set_rendered = function(text) {
        this.element.find('div.text_cell_render').html(text);
    };


    /**
     * Create Text cell from JSON
     * @param {json} data - JSON serialized text-cell
     * @method fromJSON
     */
    TextCell.prototype.fromJSON = function (data) {
        Cell.prototype.fromJSON.apply(this, arguments);
        if (data.cell_type === this.cell_type) {
            if (data.attachments !== undefined) {
                this.attachments = data.attachments;
            }
            this.cell_style = data.medatadata.cell_style || 'width=100%;';

            if (data.source !== undefined) {
                this.set_text(data.source);
                // make this value the starting point, so that we can only undo
                // to this state, instead of a blank cell
                this.code_mirror.clearHistory();
                // TODO: This HTML needs to be treated as potentially dangerous
                // user input and should be handled before set_rendered.         
                this.set_rendered(data.rendered || '');
                this.rendered = false;
                this.render();
            }
        }
    };

    /** Generate JSON from cell
     * @param {bool} gc_attachments - If true, will remove unused attachments
     *               from the returned JSON
     * @return {object} cell data serialised to json
     */
    TextCell.prototype.toJSON = function (gc_attachments) {
        if (gc_attachments === undefined) {
            gc_attachments = false;
        }

        var data = Cell.prototype.toJSON.apply(this);
        data.source = this.get_text();
        if (data.source == this.placeholder) {
            data.source = "";
        }

        // We deepcopy the attachments so copied cells don't share the same
        // objects
        if (Object.keys(this.attachments).length > 0) {
            if (gc_attachments) {
                // Garbage collect unused attachments : The general idea is to
                // render the text, and find used attachments like when we
                // substitute them in render()
                data.attachments = {};
                var that = this;
                // To find attachments, rendering to HTML is easier than
                // searching in the markdown source for the multiple ways you
                // can reference an image in markdown (using []() or a
                // HTML <img>)
                var text = this.get_text();
                marked(text, function (err, html) {
                    html = security.sanitize_html(html);
                    html = $($.parseHTML(html));
                    html.find('img[src^="attachment:"]').each(function (i, h) {
                        h = $(h);
                        var key = h.attr('src').replace(/^attachment:/, '');
                        if (key in that.attachments) {
                            data.attachments[key] = JSON.parse(JSON.stringify(
                                that.attachments[key]));
                        }

                        // This is to avoid having the browser do a GET request
                        // on the invalid attachment: URL
                        h.attr('src', '');
                    });
                });
            }
        }
        return data;
    };


    var MarkdownCell = function (options) {
        /**
         * Constructor
         *
         * Parameters:
         *  options: dictionary
         *      Dictionary of keyword arguments.
         *          events: $(Events) instance 
         *          config: ConfigSection instance
         *          keyboard_manager: KeyboardManager instance 
         *          notebook: Notebook instance
         */
        options = options || {};
        var config = utils.mergeopt(MarkdownCell, {});
        this.class_config = new configmod.ConfigWithDefaults(options.config,
                                            {}, 'MarkdownCell');
        TextCell.apply(this, [$.extend({}, options, {config: config})]);

        this.cell_type = 'markdown';
    };

    MarkdownCell.options_default = {
        cm_config: {
            mode: 'ipythongfm'
        },
        placeholder: "Type *Markdown* and LaTeX: $\\alpha^2$"
    };

    MarkdownCell.prototype = Object.create(TextCell.prototype);

    MarkdownCell.prototype.set_heading_level = function (level) {
        /**
         * make a markdown cell a heading
         */
        level = level || 1;
        var source = this.get_text();
        source = source.replace(/^(#*)\s?/,
            new Array(level + 1).join('#') + ' ');
        this.set_text(source);
        this.refresh();
        if (this.rendered) {
            this.render();
        }
    };

    MarkdownCell.prototype.select = function () {
        var cont = TextCell.prototype.select.apply(this);
        if (cont) {
            this.notebook.set_insert_image_enabled(!this.rendered);
        }
    };

    MarkdownCell.prototype.unrender = function () {
        var cont = TextCell.prototype.unrender.apply(this);
        this.notebook.set_insert_image_enabled(true);
    };

    MarkdownCell.prototype.insert_inline_image_from_blob = function(blob) {
        /**
         * Insert markup for an inline image at the current cursor position.
         * This works as follow :
         * - We insert the base64-encoded blob data into the cell attachments
         *   dictionary, keyed by the filename.
         * - We insert an img tag with a 'attachment:key' src that refers to
         *   the attachments entry.
         *
         * Parameters:
         *  file: Blob
         *      The JS Blob object (e.g. from the DataTransferItem)
         */
        var that = this;
        var pos = this.code_mirror.getCursor();
        var reader = new FileReader;
        // We can get either a named file (drag'n'drop) or a blob (copy/paste)
        // We generate names for blobs
        var key;
        if (blob.name !== undefined) {
            key = blob.name;
        } else {
            key = '_auto_' + Object.keys(that.attachments).length;
        }

        reader.onloadend = function() {
            var d = utils.parse_b64_data_uri(reader.result);
            if (blob.type != d[0]) {
                // TODO(julienr): Not sure what we should do in this case
                console.log('File type (' + blob.type + ') != data-uri ' +
                            'type (' + d[0] + ')');
            }
            that.add_attachment(key, blob.type, d[1]);
            var img_md = '![attachment:' + key + '](attachment:' + key + ')';
            that.code_mirror.replaceRange(img_md, pos);
        }
        reader.readAsDataURL(blob);
    };

    /**
     * @method render
     */
    MarkdownCell.prototype.render = function () {
        var cont = TextCell.prototype.render.apply(this);
        if (cont) {
            var that = this;
            var text = this.get_text();
            var math = null;
            if (text === "") { text = this.placeholder; }
            var text_and_math = mathjaxutils.remove_math(text);
            text = text_and_math[0];
            math = text_and_math[1];
            marked(text, function (err, html) {
                html = mathjaxutils.replace_math(html, math);
                html = security.sanitize_html(html);
                html = $($.parseHTML(html));
                // add anchors to headings
                html.find(":header").addBack(":header").each(function (i, h) {
                    h = $(h);
                    var hash = h.text().replace(/ /g, '-');
                    h.attr('id', hash);
                    h.append(
                        $('<a/>')
                            .addClass('anchor-link')
                            .attr('href', '#' + hash)
                            .text('¶')
                            .on('click',function(){
                                setTimeout(function(){that.unrender(); that.render()}, 100)
                            })
                    );
                });
                // links in markdown cells should open in new tabs
                html.find("a[href]").not('[href^="#"]').attr("target", "_blank");
                // replace attachment:<key> by the corresponding entry
                // in the cell's attachments
                html.find('img[src^="attachment:"]').each(function (i, h) {
                  h = $(h);
                  var key = h.attr('src').replace(/^attachment:/, '');

                  if (key in that.attachments) {
                    var att = that.attachments[key];
                    var mime = Object.keys(att)[0];
                    h.attr('src', 'data:' + mime + ';base64,' + att[mime][0]);
                  } else {
                    h.attr('src', '');
                  }
                });
                that.set_rendered(html);
                that.typeset();
                that.events.trigger("rendered.MarkdownCell", {cell: that});
            });
        }
        return cont;
    };

    /** @method bind_events **/
    MarkdownCell.prototype.bind_events = function () {
        TextCell.prototype.bind_events.apply(this);
        var that = this;

        this.element.dblclick(function () {
            var cont = that.unrender();
            if (cont) {
                that.focus_editor();
            }
        });

        var attachment_regex = /^image\/.*$/;

        // Event handlers to allow users to insert image using either
        // drag'n'drop or copy/paste
        var div = that.code_mirror.getWrapperElement();
        $(div).on('paste', function(evt) {
            var data = evt.originalEvent.clipboardData;
            var items = data.items;
            if (data.items !== undefined) {
                for (var i = 0; i < items.length; ++i) {
                    var item = items[i];
                    if (item.kind == 'file' && attachment_regex.test(item.type)) {
                        // TODO(julienr): This does not stop code_mirror from pasting
                        // the filename.
                        evt.stopPropagation();
                        evt.preventDefault();
                        that.insert_inline_image_from_blob(item.getAsFile());
                    }
                }
            }
        });

        // Allow drop event if the dragged file can be used as an attachment
        this.code_mirror.on("dragstart", function(cm, evt) {
            var files = evt.dataTransfer.files;
            for (var i = 0; i < files.length; ++i) {
                var file = files[i];
                if (attachment_regex.test(file.type)) {
                    return false;
                }
            }
            return true;
        });

        this.code_mirror.on("drop", function(cm, evt) {
            var files = evt.dataTransfer.files;
            for (var i = 0; i < files.length; ++i) {
                var file = files[i];
                if (attachment_regex.test(file.type)) {
                    // Prevent the default code_mirror 'drop' event handler
                    // (which inserts the file content) if this is a
                    // recognized media file
                    evt.stopPropagation();
                    evt.preventDefault();
                    that.insert_inline_image_from_blob(file);
                }
            }
        });
    };


    var RawCell = function (options) {
        /**
         * Constructor
         *
         * Parameters:
         *  options: dictionary
         *      Dictionary of keyword arguments.
         *          events: $(Events) instance 
         *          config: ConfigSection instance
         *          keyboard_manager: KeyboardManager instance 
         *          notebook: Notebook instance
         */
        options = options || {};
        var config = utils.mergeopt(RawCell, {});
        TextCell.apply(this, [$.extend({}, options, {config: config})]);

        this.class_config = new configmod.ConfigWithDefaults(options.config,
                                            RawCell.config_defaults, 'RawCell');
        this.cell_type = 'raw';
    };

    RawCell.options_default = {
        placeholder : "Write raw LaTeX or other formats here, for use with nbconvert. " +
            "It will not be rendered in the notebook. " + 
            "When passing through nbconvert, a Raw Cell's content is added to the output unmodified."
    };
    
    RawCell.config_defaults =  {
        highlight_modes : {
            'diff'         :{'reg':[/^diff/]}
        },
    };

    RawCell.prototype = Object.create(TextCell.prototype);

    /** @method bind_events **/
    RawCell.prototype.bind_events = function () {
        TextCell.prototype.bind_events.apply(this);
        var that = this;
        this.element.focusout(function() {
            that.auto_highlight();
            that.render();
        });

        this.code_mirror.on('focus', function() { that.unrender(); });
    };

    /** @method render **/
    RawCell.prototype.render = function () {
        var cont = TextCell.prototype.render.apply(this);
        if (cont){
            var text = this.get_text();
            if (text === "") { text = this.placeholder; }
            this.set_text(text);
            this.element.removeClass('rendered');
            this.auto_highlight();
        }
        return cont;
    };

    var textcell = {
        TextCell: TextCell,
        MarkdownCell: MarkdownCell,
        RawCell: RawCell
    };
    return textcell;
});
