<template>
	<div id="app" class="fill row">
		<CodeEditor class="grow" style="width: 50%" @build="onBuild($event)"></CodeEditor>
		<Output class="grow border-left" :entries="outputEntries" style="width: 50%"></Output>
	</div>
</template>

<style>
	body {
		background-color: black;
		color: white;
		font-family: "Courier New", Courier, monospace;
		font-size: 14px;
	}

	.border-left {
		border-left: 1px solid grey;
	}

	.fill {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100% !important; /* Important because CodeMirror overrides it */
	}

	#app {
		height: 100vh;
	}

	.col {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: flex;
		flex-direction: row;
	}

	.grow {
		flex-grow: 1;
	}

	button {
		border: none;
		background: none;
		color: white;
		font-family: "Courier New", Courier, monospace;
		padding: 2px;
		outline: none;
	}

	button:focus {
		color: #ccffff;
	}

	button:hover {
		color: cyan;
	}

	button:active {
		color: #00ff00;
	}

	button::before {
		text-align: left;
		content: "[ ";
	}

	button::after {
		content: " ]";
	}
</style>
        
<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"
	import { IEntry } from './components/Output.vue'
	import { ITokenizationResult, IAssembledOutput } from './assembler'

	export function encodeHTML(text: string) {
		return text.split("").map(v => "&#" + v.charCodeAt(0) + ";").join("")
	}

	@Component({
		components: {
			CodeEditor: () => import("./components/CodeEditor.vue"),
			Output: () => import("./components/Output.vue")
		}
	})
	export default class App extends Vue {
		outputEntries: IEntry[] = []

		log(entry: IEntry) {
			this.outputEntries.unshift(entry)
		}

		onBuild(result: IAssembledOutput) {
			var content = result.tokens.map(
				v => `<span style="color: lightgreen">${encodeHTML(JSON.stringify(v.text))}</span> : <span style="color: skyblue">${v.type}</span> at ${v.span.from.line + 1}:${v.span.to.ch}`
			).join("<br>")
			if (result.errors.length > 0) {
				this.log({ title: `<span style="color: lightsalmon">[ERR] ${result.errors.map(v => v.text).join("<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")}</span>`, actions: [], content })
			} else {
				this.log({
					title: `Tokenization successful`,
					actions: [],
					content
				})
			}
		}
	}
</script>