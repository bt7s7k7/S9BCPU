<template>
	<div id="app" class="fill">
		<div class="fill row">
			<div style="flex-basis: 200px" class="cpu-info" v-html="cpuInfo"></div>
			<div class="grow row border-left">
				<CodeEditor class="grow relative contain" @build="onBuild($event)"></CodeEditor>
				<Output class="border-left grow contain" :entries="outputEntries"></Output>
			</div>
		</div>
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
		border-left: 1px solid #212121;
    }
    
    .border-top {
		border-top: 1px solid #212121;
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
		flex-grow: 1
	}

    .relative {
        position: relative;
    }

    .contain {
        contain: strict;
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
    
    .cpu-info > * {
        border-bottom: 1px solid #111111;
    }
    
    .cpu-info {
        padding: 4px;
    }
</style>
        
<script lang="ts">
	import Vue from 'vue'
	import Component from "vue-class-component"
	import * as vueProp from "vue-property-decorator"
	import { IEntry } from './components/Output.vue'
	import { IAssembledOutput, debugStatement, Statement } from 's9b-compiler'
    import { S9BCPU } from "./CPU/s9b"

    window.addEventListener("keydown", (event)=>{
        if (event.ctrlKey && event.code == "KeyS") event.preventDefault()
    })
    
	@Component({
		components: {
			CodeEditor: () => import("./components/CodeEditor.vue"),
			Output: () => import("./components/Output.vue")
		}
	})
	export default class App extends Vue {
		outputEntries: IEntry[] = []
		cpu = new S9BCPU(2 ** 9)

		log(entry: IEntry) {
			this.outputEntries.unshift(entry)
		}

		onBuild(result: IAssembledOutput) {
			var lastStatement = null as Statement | null
			var content = result.binOut.map((v, i) => {
				let statement = result.lookup[i]
				if (!statement || lastStatement == statement) {
					return `${i}: ${v}`
				} else {
					lastStatement = statement
					return `${debugStatement(statement, true)} at ${statement.span.from.line + 1}:${statement.span.to.ch}<br>${i}: ${v} `
				}
			}).join("<br>")
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


		public get cpuInfo(): string {
			return this.cpu.getInfo()
		}

	}
</script>