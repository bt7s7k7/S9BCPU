<template>
	<div id="app" class="fill row">
		<CodeEditor class="grow"></CodeEditor>
	</div>
</template>

<style>
	body {
		background-color: black;
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

	@Component({
		components: {
			CodeEditor: () => import("./components/CodeEditor.vue")
		}
	})
	export default class App extends Vue {

	}
</script>