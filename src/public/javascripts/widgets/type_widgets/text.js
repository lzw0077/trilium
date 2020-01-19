import libraryLoader from "../../services/library_loader.js";
import treeService from '../../services/tree.js';
import noteAutocompleteService from '../../services/note_autocomplete.js';
import mimeTypesService from '../../services/mime_types.js';
import TabAwareWidget from "../tab_aware_widget.js";
import TypeWidget from "./type_widget.js";

const ENABLE_INSPECTOR = false;

const mentionSetup = {
    feeds: [
        {
            marker: '@',
            feed: queryText => {
                return new Promise((res, rej) => {
                    noteAutocompleteService.autocompleteSource(queryText, rows => {
                        if (rows.length === 1 && rows[0].title === 'No results') {
                            rows = [];
                        }

                        for (const row of rows) {
                            row.text = row.name = row.noteTitle;
                            row.id = '@' + row.text;
                            row.link = '#' + row.path;
                        }

                        res(rows);
                    });
                });
            },
            itemRenderer: item => {
                const itemElement = document.createElement('span');

                itemElement.classList.add('mentions-item');
                itemElement.innerHTML = `${item.highlightedTitle} `;

                return itemElement;
            },
            minimumCharacters: 0
        }
    ]
};

const TPL = `
<div class="note-detail-text note-detail-printable">
    <style>
    .note-detail-text h1 { font-size: 2.0em; }
    .note-detail-text h2 { font-size: 1.8em; }
    .note-detail-text h3 { font-size: 1.6em; }
    .note-detail-text h4 { font-size: 1.4em; }
    .note-detail-text h5 { font-size: 1.2em; }
    .note-detail-text h6 { font-size: 1.1em; }
    
    .note-detail-text {
        overflow: auto;
        font-family: var(--detail-text-font-family);
    }
    
    .note-detail-text-editor {
        padding-top: 10px;
        border: 0 !important;
        box-shadow: none !important;
        /* This is because with empty content height of editor is 0 and it's impossible to click into it */
        min-height: 500px;
    }
    
    .note-detail-text p:first-child, .note-detail-text::before {
        margin-top: 0;
    }
    </style>

    <div class="note-detail-text-editor" tabindex="10000"></div>
</div>
`;

class TextTypeWidget extends TypeWidget {
    static getType() { return "text"; }

    doRender() {
        this.$widget = $(TPL);
        this.$editor = this.$widget.find('.note-detail-text-editor');

        this.$widget.on("dblclick", "img", e => {
            const $img = $(e.target);
            const src = $img.prop("src");

            const match = src.match(/\/api\/images\/([A-Za-z0-9]+)\//);

            if (match) {
                const noteId = match[1];

                treeService.activateNote(noteId);
            }
            else {
                window.open(src, '_blank');
            }
        });

        this.initialized = this.initEditor();

        return this.$widget;
    }

    async initEditor() {
        await libraryLoader.requireLibrary(libraryLoader.CKEDITOR);

        const codeBlockLanguages =
            (await mimeTypesService.getMimeTypes())
                .filter(mt => mt.enabled)
                .map(mt => {
                    return {
                        language: mt.mime.toLowerCase().replace(/[\W_]+/g,"-"),
                        label: mt.title
                    }
                });

        // CKEditor since version 12 needs the element to be visible before initialization. At the same time
        // we want to avoid flicker - i.e. show editor only once everything is ready. That's why we have separate
        // display of $widget in both branches.
        this.$widget.show();

        this.textEditor = await BalloonEditor.create(this.$editor[0], {
            placeholder: "Type the content of your note here ...",
            mention: mentionSetup,
            codeBlock: {
                languages: codeBlockLanguages
            }
        });

        if (glob.isDev && ENABLE_INSPECTOR) {
            await import('../../libraries/ckeditor/inspector.js');
            CKEditorInspector.attach(this.textEditor);
        }
    }

    async doRefresh() {
        this.textEditor.isReadOnly = await this.isReadOnly();

        this.$widget.show();

        this.textEditor.setData(this.tabContext.note.content);
    }

    getContent() {
        const content = this.textEditor.getData();

        // if content is only tags/whitespace (typically <p>&nbsp;</p>), then just make it empty
        // this is important when setting new note to code
        return this.isContentEmpty(content) ? '' : content;
    }

    isContentEmpty(content) {
        content = content.toLowerCase();

        return jQuery(content).text().trim() === ''
            && !content.includes("<img")
            && !content.includes("<section")
    }

    async isReadOnly() {
        const attributes = await this.tabContext.attributes.getAttributes();

        return attributes.some(attr => attr.type === 'label' && attr.name === 'readOnly');
    }

    focus() {
        this.$editor.trigger('focus');
    }

    show() {}

    getEditor() {
        return this.textEditor;
    }

    onNoteChange(func) {
        this.textEditor.model.document.on('change:data', func);
    }

    cleanup() {
        if (this.textEditor) {
            this.textEditor.setData('');
        }
    }

    scrollToTop() {
        this.$widget.scrollTop(0);
    }
}

export default TextTypeWidget;