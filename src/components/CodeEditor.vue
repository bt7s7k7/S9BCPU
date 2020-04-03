<template>
	<div class="col grow">
		<div class="col grow">
			<textarea style="resizable: none" ref="editorArea"></textarea>
		</div>
		<div>
			<button>Compile</button>
			<button>Deploy</button>
		</div>
	</div>
</template>

<style>
	.cm-s-custom.CodeMirror {
		background-color: black;
	}

	.cm-s-custom .cm-move {
		color: green;
	}

	.cm-s-custom .cm-condition {
		color: cyan;
	}

	.cm-s-custom .cm-action {
		color: orange;
	}
</style>

<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"
	import { EditorFromTextArea, fromTextArea } from "codemirror"
	import "codemirror/theme/material-darker.css"
	import "codemirror/lib/codemirror.css"
	import "../syntax"

	@Component
	export default class CodeEditor extends Vue {
		editor!: EditorFromTextArea
		code: string = localStorage["s9bcpu-code"] || ""

		mounted() {
			const editorArea = this.$refs.editorArea as HTMLTextAreaElement
			editorArea.parentElement?.childNodes.forEach(v => {
				if (v != editorArea) v.remove()
			})
			this.editor = fromTextArea(editorArea, {
				lineNumbers: true,
				theme: "material-darker custom",
				indentWithTabs: true,
				mode: "sasm"
			})
			this.editor.setValue(this.code)
			this.editor.getWrapperElement().classList.add("grow")
			this.editor.on("change", () => {
				this.code = this.editor.getValue()
			})
		}

		unmounted() {
			this.editor.getWrapperElement().remove()
		}

		@vueProp.Watch("code")
		onCodeChanged(newValue: string) {
			if (this.editor.getValue() != newValue) this.editor.setValue(this.code)
			localStorage["s9bcpu-code"] = newValue
		}
	}
</script>