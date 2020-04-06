<template>
	<div class="col grow">
		<div class="col grow">
			<textarea style="resizable: none" ref="editorArea"></textarea>
		</div>
		<div>
			<button @click="build()">Build</button>
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

	.CodeMirror-lint-tooltip {
		transition: opacity 0s !important;
		border-radius: 0 !important;
		background-color: #111111;
        border-color: #333333;
        color: #aaaaaa;
	}
</style>

<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"
	import { EditorFromTextArea, fromTextArea, Position } from "codemirror"
	import "codemirror/theme/material-darker.css"
	import "codemirror/lib/codemirror.css"
	import "../syntax"
	import { assemble, IAssembledOutput } from '../compilation/assembler'
	import "codemirror/addon/lint/lint"
	import "codemirror/addon/lint/lint.css"

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
				mode: "sasm",
				lint: {
					getAnnotations(code: string) {
						var assembly = assemble(code)
						var annotations = [
							...assembly.errors.map(v => ({
								from: v.span.from,
								to: v.span.to,
								message: v.text,
								severity: "error"
							})),
							...assembly.annotations.map(v => ({
								from: v.span.from,
								to: v.span.to,
								message: v.text,
								severity: "info"
							}))
						]
						return annotations
					}
				}
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

		build() {
			this.$emit("build", assemble(this.code))
		}
	}
</script>